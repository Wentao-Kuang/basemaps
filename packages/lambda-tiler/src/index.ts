import { LogConfig } from '@basemaps/shared';
import { LambdaHttpResponse, lf } from '@linzjs/lambda';
import { arcgisInfoGet } from './arcgis/arcgis.info.js';
import { arcgisStyleJsonGet } from './arcgis/arcgis.style.json.js';
import { arcgisTileServerGet } from './arcgis/vector.tile.server.js';
import { tileAttributionGet } from './routes/attribution.js';
import { configImageryGet, configTileSetGet } from './routes/config.js';
import { fontGet, fontList } from './routes/fonts.js';
import { healthGet } from './routes/health.js';
import { imageryGet } from './routes/imagery.js';
import { pingGet } from './routes/ping.js';
import { spriteGet } from './routes/sprites.js';
import { tileJsonGet } from './routes/tile.json.js';
import { styleJsonGet } from './routes/tile.style.json.js';
import { wmtsCapabilitiesGet } from './routes/tile.wmts.js';
import { tileXyzGet } from './routes/tile.xyz.js';
import { versionGet } from './routes/version.js';
import { NotFound, OkResponse } from './util/response.js';
import { CoSources } from './util/source.cache.js';
import { St } from './util/source.tracer.js';
import { tilePreviewGet } from './routes/preview.js';
import { previewIndexGet } from './routes/preview.index.js';

export const handler = lf.http(LogConfig.get());

/** If the request takes too long, respond with a 408 timeout when there is approx 1 second remaining */
handler.router.timeoutEarlyMs = 1_000;

handler.router.hook('request', (req) => {
  req.set('name', 'LambdaTiler');

  // Reset the request tracing before every request
  St.reset();
});

handler.router.hook('response', (req, res) => {
  if (St.requests.length > 0) {
    // TODO this could be relaxed to every say 5% of requests if logging gets too verbose.
    req.set('requests', St.requests.slice(0, 100)); // limit to 100 requests (some tiles need 100s of requests)
    req.set('requestCount', St.requests.length);
  }
  // Log the source cache hit/miss ratio
  req.set('sources', {
    hits: CoSources.cache.hits,
    misses: CoSources.cache.misses,
    size: CoSources.cache.currentSize,
    resets: CoSources.cache.resets,
    clears: CoSources.cache.clears,
    cacheA: CoSources.cache.cacheA.size,
    cacheB: CoSources.cache.cacheB.size,
  });

  // Force access-control-allow-origin to everything
  res.header('access-control-allow-origin', '*');
});

// CORS is handled by response hook so just return ok if the route exists
handler.router.options('*', (req) => {
  const route = handler.router.router.find('GET', req.path);
  if (route == null) return NotFound();
  return LambdaHttpResponse.ok();
});

// TODO some internal health checks hit these routes, we should change them all to point at /v1/
handler.router.get('/ping', pingGet);
handler.router.get('/health', healthGet);
handler.router.get('/version', versionGet);

handler.router.get('/v1/ping', pingGet);
handler.router.get('/v1/health', healthGet);
handler.router.get('/v1/version', versionGet);

// Image Metadata
handler.router.get('/v1/imagery/:imageryId/:fileName', imageryGet);

// Config
handler.router.get('/v1/config/:tileSet.json', configTileSetGet);
handler.router.get('/v1/config/:tileSet/:imageryId.json', configImageryGet);

// Sprites
handler.router.get('/v1/sprites/:spriteName', spriteGet);

// Fonts
handler.router.get('/v1/fonts.json', fontList);
handler.router.get('/v1/fonts/:fontStack/:range.pbf', fontGet);

// StyleJSON
handler.router.get('/v1/styles/:styleName.json', styleJsonGet);
/** @deprecated 2022-07-22 all styles should be being served from /v1/styles/:styleName.json */
handler.router.get('/v1/tiles/:tileSet/:tileMatrix/style/:styleName.json', styleJsonGet);

// TileJSON
handler.router.get('/v1/tiles/:tileSet/:tileMatrix/tile.json', tileJsonGet);

// Tiles
handler.router.get('/v1/tiles/:tileSet/:tileMatrix/:z/:x/:y.:tileType', tileXyzGet);

// Preview
handler.router.get('/v1/preview/:tileSet/:tileMatrix/:z/:lon/:lat', tilePreviewGet);
handler.router.get('/v1/@:location', previewIndexGet);
handler.router.get('/@:location', previewIndexGet);

// Attribution
handler.router.get('/v1/tiles/:tileSet/:tileMatrix/attribution.json', tileAttributionGet);
handler.router.get('/v1/attribution/:tileSet/:tileMatrix/summary.json', tileAttributionGet);

// WMTS Capabilities
handler.router.get('/v1/tiles/:tileSet/:tileMatrix/WMTSCapabilities.xml', wmtsCapabilitiesGet);
handler.router.get('/v1/tiles/:tileSet/WMTSCapabilities.xml', wmtsCapabilitiesGet);
handler.router.get('/v1/tiles/WMTSCapabilities.xml', wmtsCapabilitiesGet);

// Arcgis Vector
handler.router.get('/v1/arcgis/rest/services/:tileSet/VectorTileServer', arcgisTileServerGet);
handler.router.post('/v1/arcgis/rest/services/:tileSet/VectorTileServer', OkResponse);
handler.router.get('/v1/arcgis/rest/services/:tileSet/VectorTileServer/root.json', arcgisStyleJsonGet);
handler.router.get('/v1/arcgis/rest/info', arcgisInfoGet);
