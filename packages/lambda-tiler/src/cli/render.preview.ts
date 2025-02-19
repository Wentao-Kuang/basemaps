import { ConfigProviderMemory } from '@basemaps/config';
import { initConfigFromUrls } from '@basemaps/config/build/json/tiff.config.js';
import { ImageFormat, TileMatrixSet, TileMatrixSets } from '@basemaps/geo';
import { LogConfig, setDefaultConfig } from '@basemaps/shared';
import { fsa } from '@chunkd/fs';
import { LambdaHttpRequest, LambdaUrlRequest, UrlEvent } from '@linzjs/lambda';
import { Context } from 'aws-lambda';
import { pathToFileURL } from 'url';
import { renderPreview } from '../routes/preview.js';

const target = pathToFileURL(`/home/blacha/tmp/basemaps/bm-724/test-north-island_20230220_10m/`);
const location = { lat: -39.0852555, lon: 177.3998405 };
const z = 12;

const outputFormat = ImageFormat.Webp;
let tileMatrix: TileMatrixSet | null = null;

async function main(): Promise<void> {
  const log = LogConfig.get();
  const provider = new ConfigProviderMemory();
  setDefaultConfig(provider);
  const { tileSet, imagery } = await initConfigFromUrls(provider, [target]);

  if (tileSet.layers.length === 0) throw new Error('No imagery found in path: ' + target);
  log.info({ tileSet: tileSet.name, layers: tileSet.layers.length }, 'TileSet:Loaded');

  for (const im of imagery) {
    log.info({ url: im.uri, title: im.title, tileMatrix: im.tileMatrix, files: im.files.length }, 'Imagery:Loaded');
    if (tileMatrix == null) {
      tileMatrix = TileMatrixSets.find(im.tileMatrix);
      log.info({ tileMatrix: im.tileMatrix }, 'Imagery:TileMatrix:Set');
    }
  }

  if (tileMatrix == null) throw new Error('No tileMatrix found');

  const req = new LambdaUrlRequest({ headers: {} } as UrlEvent, {} as Context, LogConfig.get()) as LambdaHttpRequest;
  const res = await renderPreview(req, { tileMatrix, tileSet, location, z, outputFormat });
  const previewFile = `./z${z}_${location.lon}_${location.lat}.${outputFormat}`;
  await fsa.write(previewFile, Buffer.from(res.body, 'base64'));
  log.info({ path: previewFile }, 'Tile:Write');
}

main();
