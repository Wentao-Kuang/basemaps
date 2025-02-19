import { ConfigProviderMemory } from '@basemaps/config';
import o from 'ospec';
import { createSandbox } from 'sinon';
import { handler } from '../../index.js';
import { ConfigLoader } from '../../util/config.loader.js';
import { Imagery2193, Imagery3857, Provider, TileSetAerial } from '../../__tests__/config.data.js';
import { Api, mockUrlRequest } from '../../__tests__/xyz.util.js';

o.spec('WMTSRouting', () => {
  const sandbox = createSandbox();
  const config = new ConfigProviderMemory();
  const imagery = new Map();

  o.beforeEach(() => {
    sandbox.stub(ConfigLoader, 'load').resolves(config);

    imagery.set(Imagery3857.id, Imagery3857);
    imagery.set(Imagery2193.id, Imagery2193);

    config.put(TileSetAerial);
    config.put(Imagery2193);
    config.put(Imagery3857);
    config.put(Provider);
  });

  o.afterEach(() => {
    config.objects.clear();
    sandbox.restore();
  });

  o('should default to the aerial layer', async () => {
    const req = mockUrlRequest(
      '/v1/tiles/WMTSCapabilities.xml',
      `format=png&api=${Api.key}&config=s3://linz-basemaps/config.json`,
    );
    const res = await handler.router.handle(req);

    o(res.status).equals(200);
    const lines = Buffer.from(res.body, 'base64').toString().split('\n');

    const titles = lines.filter((f) => f.startsWith('      <ows:Title>')).map((f) => f.trim());

    o(titles).deepEquals([
      '<ows:Title>Aerial Imagery</ows:Title>',
      '<ows:Title>Ōtorohanga 0.1m Urban Aerial Photos (2021)</ows:Title>',
      '<ows:Title>Google Maps Compatible for the World</ows:Title>',
      '<ows:Title>LINZ NZTM2000 Map Tile Grid V2</ows:Title>',
    ]);

    const resourceURLs = lines.filter((f) => f.includes('<ResourceURL')).map((f) => f.trim());
    o(resourceURLs).deepEquals([
      '<ResourceURL format="image/png" resourceType="tile" template="https://tiles.test/v1/tiles/aerial/{TileMatrixSet}/{TileMatrix}/{TileCol}/{TileRow}.png?api=d01f7w7rnhdzg0p7fyrc9v9ard1&amp;config=Q5pC4UjWdtFLU1CYtLcRSmB49RekgDgMa5EGJnB2M" />',
      '<ResourceURL format="image/png" resourceType="tile" template="https://tiles.test/v1/tiles/ōtorohanga-urban-2021-0.1m/{TileMatrixSet}/{TileMatrix}/{TileCol}/{TileRow}.png?api=d01f7w7rnhdzg0p7fyrc9v9ard1&amp;config=Q5pC4UjWdtFLU1CYtLcRSmB49RekgDgMa5EGJnB2M" />',
    ]);
  });

  o('should filter out date[after] by year', async () => {
    const req = mockUrlRequest(
      '/v1/tiles/WMTSCapabilities.xml',
      `format=png&api=${Api.key}&config=s3://linz-basemaps/config.json&date[after]=2022`,
    );
    const res = await handler.router.handle(req);

    o(res.status).equals(200);
    const lines = Buffer.from(res.body, 'base64').toString().split('\n');
    const titles = lines.filter((f) => f.startsWith('      <ows:Title>')).map((f) => f.trim());

    o(titles).deepEquals([
      '<ows:Title>Aerial Imagery</ows:Title>',
      '<ows:Title>Google Maps Compatible for the World</ows:Title>',
      '<ows:Title>LINZ NZTM2000 Map Tile Grid V2</ows:Title>',
    ]);
  });

  o('should filter out date[before] by year', async () => {
    const req = mockUrlRequest(
      '/v1/tiles/WMTSCapabilities.xml',
      `format=png&api=${Api.key}&config=s3://linz-basemaps/config.json&date[before]=2020`,
    );
    const res = await handler.router.handle(req);

    o(res.status).equals(200);
    const lines = Buffer.from(res.body, 'base64').toString().split('\n');
    const titles = lines.filter((f) => f.startsWith('      <ows:Title>')).map((f) => f.trim());

    o(titles).deepEquals([
      '<ows:Title>Aerial Imagery</ows:Title>',
      '<ows:Title>Google Maps Compatible for the World</ows:Title>',
      '<ows:Title>LINZ NZTM2000 Map Tile Grid V2</ows:Title>',
    ]);
  });

  o('should filter inclusive date[before] by year', async () => {
    const req = mockUrlRequest(
      '/v1/tiles/WMTSCapabilities.xml',
      `format=png&api=${Api.key}&config=s3://linz-basemaps/config.json&date[before]=2021`,
    );
    const res = await handler.router.handle(req);

    o(res.status).equals(200);
    const lines = Buffer.from(res.body, 'base64').toString().split('\n');
    const titles = lines.filter((f) => f.startsWith('      <ows:Title>')).map((f) => f.trim());

    o(titles).deepEquals([
      '<ows:Title>Aerial Imagery</ows:Title>',
      '<ows:Title>Ōtorohanga 0.1m Urban Aerial Photos (2021)</ows:Title>',
      '<ows:Title>Google Maps Compatible for the World</ows:Title>',
      '<ows:Title>LINZ NZTM2000 Map Tile Grid V2</ows:Title>',
    ]);

    const resourceURLs = lines.filter((f) => f.includes('<ResourceURL')).map((f) => f.trim());
    o(resourceURLs).deepEquals([
      '<ResourceURL format="image/png" resourceType="tile" template="https://tiles.test/v1/tiles/aerial/{TileMatrixSet}/{TileMatrix}/{TileCol}/{TileRow}.png?api=d01f7w7rnhdzg0p7fyrc9v9ard1&amp;config=Q5pC4UjWdtFLU1CYtLcRSmB49RekgDgMa5EGJnB2M&amp;date%5Bbefore%5D=2021" />',
      '<ResourceURL format="image/png" resourceType="tile" template="https://tiles.test/v1/tiles/ōtorohanga-urban-2021-0.1m/{TileMatrixSet}/{TileMatrix}/{TileCol}/{TileRow}.png?api=d01f7w7rnhdzg0p7fyrc9v9ard1&amp;config=Q5pC4UjWdtFLU1CYtLcRSmB49RekgDgMa5EGJnB2M" />',
    ]);
  });
});
