import {
  BoundingBox,
  Bounds,
  EpsgCode,
  ImageFormat,
  NamedBounds,
  Nztm2000QuadTms,
  TileMatrixSets,
} from '@basemaps/geo';
import { fsa } from '@chunkd/fs';
import { CogTiff } from '@cogeotiff/core';
import pLimit, { LimitFunction } from 'p-limit';
import { basename } from 'path';
import { StacCollection } from 'stac-ts';
import { fileURLToPath } from 'url';
import { sha256base58 } from '../base58.node.js';
import { ConfigImagery } from '../config/imagery.js';
import { ConfigTileSetRaster, TileSetType } from '../config/tile.set.js';
import { ConfigProviderMemory } from '../memory/memory.config.js';
import { ConfigJson, isEmptyTiff } from './json.config.js';
import { LogType } from './log.js';

/** Does a file look like a tiff, ending in .tif or .tiff */
function isTiff(f: string): boolean {
  const lowered = f.toLocaleLowerCase();
  return lowered.endsWith('.tif') || lowered.endsWith('.tiff');
}

/** Summary of a collection of tiffs */
interface TiffSummary {
  /** List of tiffs and their extents */
  files: NamedBounds[];
  /** Overall bounding box */
  bounds: BoundingBox;
  /** EpsgCode for the tiffs */
  projection: number;
  /** Ground sample distance, number of meters per pixel */
  gsd: number;
  /** STAC collection if it was found with the imagery */
  collection?: StacCollection;
  /** URL to the base of the imagery */
  url: string;
}

export type ConfigImageryTiff = ConfigImagery & TiffSummary;

/**
 * Read all tiffs from a target path and ensure all tiffs contain the same GSD and EPSG code,
 * while computing bounding boxes for the entire imagery set
 *
 * @throws if any of the tiffs have differing EPSG or GSD
 **/
function computeTiffSummary(target: URL, tiffs: CogTiff[]): TiffSummary {
  const res: Partial<TiffSummary> = { files: [] };

  const targetPath = urlToString(target);
  let bounds: Bounds | undefined;
  for (const tiff of tiffs) {
    const firstImage = tiff.getImage(0);

    const epsg = firstImage.epsg;
    if (epsg == null) throw new Error(`No ESPG projection found. source:` + tiff.source.uri);

    // Validate all EPSG codes are the same for each imagery set
    if (res.projection == null) res.projection = epsg;
    else if (res.projection !== epsg) {
      throw new Error(`ESPG projection mismatch on imagery ${res.projection} vs ${epsg} source:` + tiff.source.uri);
    }

    const gsd = firstImage.resolution[0];
    if (res.gsd == null) res.gsd = gsd;
    else {
      const gsdDiff = Math.abs(res.gsd - gsd);
      if (gsdDiff > 0.001) throw new Error(`GSD mismatch on imagery ${res.gsd} vs ${gsd}`);
    }

    const gsdRound = Math.floor(gsd * 100) / 10000;
    const bbox = firstImage.bbox.map((f) => Math.floor(f / gsdRound) * gsdRound);
    const imgBounds = Bounds.fromBbox(bbox);

    if (bounds == null) bounds = imgBounds;
    else bounds = bounds.union(imgBounds);

    if (res.files == null) res.files = [];

    const relativePath = toRelative(targetPath, tiff.source.uri);
    res.files.push({ name: relativePath, ...imgBounds });
  }
  res.bounds = bounds?.toJson();
  if (res.bounds == null) throw new Error('Failed to extract imagery bounds from:' + target);
  if (res.projection == null) throw new Error('Failed to extract imagery epsg from:' + target);
  if (res.files == null || res.files.length === 0) throw new Error('Failed to extract imagery from:' + target);
  return res as TiffSummary;
}

/** Convert a path to a relative path
 * @param base the path to be relative to
 * @param other the path to convert
 */
function toRelative(base: string, other: string): string {
  if (!other.startsWith(base)) throw new Error('Paths are not relative');
  const part = other.slice(base.length);
  if (part.startsWith('/') || part.startsWith('\\')) return part.slice(1);
  return part;
}

/** Convert a URL to a string using fileUrlToPath if the URL is a file:// */
function urlToString(u: URL): string {
  if (u.protocol === 'file:') return fileURLToPath(u);
  return u.href;
}

/** Attempt to read a stac collection.json from the target path if it exists or return null if anything goes wrong. */
async function loadStacFromURL(target: URL): Promise<StacCollection | null> {
  const collectionPath = new URL('collection.json', target);
  try {
    return await fsa.readJson(urlToString(collectionPath));
  } catch (e) {
    return null;
  }
}

/** When attempting to guess a folder name, try and ignore common imagery types and projection */
const IgnoredTitles = new Set([
  // Imagery
  'rgb',
  'rgbi',
  // Elevation
  'dem_1m',
  'dsm_1m',
  // Argo folders
  'flat',
  //Projections
  '2193',
  '3857',
]);

/**
 * Guess a better imagery name from a target URL
 *
 * A lot of our source paths include the type of imagery eg "rgb", "rgbi" or "dem_1m",
 * these names are not super helpful and often there are better names further up the pathname
 *
 * @example
 * ```typescript
 * getImageryName('s3://linz-imagery/auckland/auckland_sn5600_1979_0.375m/2193/rgb/')
 * // auckland_sn5600_1979_0.375m
 * ```
 *
 * The list of paths ignored are from
 *
 * @see {IgnoredTitles}
 *
 * For common imagery paths see:
 *
 * @see {@link https://github.com/linz/imagery}
 * @see {@link https://github.com/linz/elevation}
 */
export function getImageryName(target: URL): string {
  const parts = target.pathname.split('/'); // URL folders are always "/"

  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (part === '') continue;
    if (IgnoredTitles.has(part.toLowerCase())) continue;
    return part;
  }

  // Everything is ignored just use basename
  return basename(target.pathname);
}

/**
 * Attempt to load all imagery inside of a path and create a configuration from it
 *
 * @param target path that contains the imagery
 *
 * @returns Imagery configuration generated from the path
 */
export async function initImageryFromTiffUrl(
  provider: ConfigProviderMemory,
  target: URL,
  Q: LimitFunction,
  log?: LogType,
): Promise<ConfigImageryTiff> {
  const targetPath = urlToString(target);
  const sourceFiles = await fsa.toArray(fsa.list(targetPath));

  // Load metadata about all the tiffs ignoring any empty sparse tiffs
  const tiffs = (
    await Promise.all(
      sourceFiles.filter(isTiff).map((c) =>
        Q(async () => {
          const tiff = await new CogTiff(fsa.source(c)).init(true);
          if (await isEmptyTiff(tiff)) return null;
          return tiff;
        }),
      ),
    )
  ).filter((f) => f != null) as CogTiff[];

  try {
    const stac = await loadStacFromURL(target);
    if (stac == null) log?.warn({ target: targetPath }, 'Tiff:StacNotFound');
    const params = computeTiffSummary(target, tiffs);

    const imageryName = getImageryName(target);
    const title = stac?.title ?? imageryName;
    const tileMatrix =
      params.projection === EpsgCode.Nztm2000 ? Nztm2000QuadTms : TileMatrixSets.tryGet(params.projection);

    const imagery: ConfigImageryTiff = {
      id: provider.Imagery.id(sha256base58(target.href)),
      name: imageryName,
      title,
      updatedAt: Date.now(),
      projection: params.projection,
      tileMatrix: tileMatrix?.identifier ?? 'none',
      gsd: params.gsd,
      uri: targetPath,
      url: target.href,
      bounds: params.bounds,
      files: params.files,
      collection: stac ?? undefined,
    };
    imagery.overviews = await ConfigJson.findImageryOverviews(imagery);
    log?.info({ title, imageryName, files: imagery.files.length }, 'Tiff:Loaded');
    provider.put(imagery);

    return imagery;
  } finally {
    await Promise.all(tiffs.map((t) => t.close()));
  }
}

/**
 * Create configuration from a folder full of tiffs or a folder of folders of tiffs
 *
 * Given the following folder structure
 *
 * ```typescript
 * "/imagery/invercargill_2022_0.05m/*.tiff"
 * "/imagery/wellington_2022_0.05/*.tiff"
 * ```
 *
 * A. A single imagery datasets
 *
 * ```typescript
 * target = ["/imagery/invercargill_2022_0.05m/"]
 * ```
 *
 * will load all tiffs from the resulting folder into a single tile set `aerial`
 *
 * B: A tree of imagery datasets
 *
 * ```typescript
 * target = ["/imagery/invercargill_2022_0.05m/*.tiff", "/imagery/wellington_2022_0.05/*.tiff"]
 * ```
 *
 * will load all tiffs from all folders targets into a single tile set "aerial",
 * then load each folder into their own tile set.
 *
 * The rendering order will be the order of the target locations
 *
 * tile sets:  aerial, wellington_2022_0.05, invercargill_2022_0.05m
 *
 * @param provider where to store all the configuration generated
 * @param targets the target location
 * @param concurrency number of tiff files to load at a time
 * @returns
 */
export async function initConfigFromUrls(
  provider: ConfigProviderMemory,
  targets: URL[],
  concurrency = 25,
  log?: LogType,
): Promise<{ tileSet: ConfigTileSetRaster; imagery: ConfigImageryTiff[] }> {
  const q = pLimit(concurrency);

  const imageryConfig: Promise<ConfigImageryTiff>[] = [];
  for (const target of targets) imageryConfig.push(initImageryFromTiffUrl(provider, target, q, log));

  const aerialTileSet: ConfigTileSetRaster = {
    id: 'ts_aerial',
    name: 'aerial',
    title: 'Basemaps',
    category: 'Basemaps',
    type: TileSetType.Raster,
    format: ImageFormat.Webp,
    layers: [],
  };

  provider.put(aerialTileSet);
  const configs = await Promise.all(imageryConfig);
  for (const cfg of configs) {
    let existingLayer = aerialTileSet.layers.find((l) => l.title === cfg.title);
    if (existingLayer == null) {
      existingLayer = { name: cfg.name, title: cfg.title };
      aerialTileSet.layers.push(existingLayer);
    }
    existingLayer[cfg.projection] = cfg.id;
  }

  return { tileSet: aerialTileSet, imagery: configs };
}
