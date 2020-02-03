import { EPSG } from '@basemaps/shared';
import { MosaicCog } from '../../tiff.mosaic';

MosaicCog.create({
    id: '01E048V4RGNGTK1YN6DFH8K0SR',
    name: 'invercargill_urban_2016_0-05m',
    projection: EPSG.Wgs84,

    minZoom: 14,
    priority: 150,
    year: 2016,
    resolution: 50,
    quadKeys: [
        '3131031312133',
        '31310313121123',
        '31310313121301',
        '31310313121303',
        '31310313121310',
        '31310313121312',
        '31310313121313',
        '31310313121321',
        '31310313121323',
        '31310313123110',
        '31310313301120',
        '31310313301121',
        '31310313301123',
        '313103131211320',
        '313103131211322',
        '313103131211323',
        '313103131213001',
        '313103131213003',
        '313103131213110',
        '313103131213112',
        '313103131213113',
        '313103131231011',
        '313103131231013',
        '313103131231031',
        '313103131231110',
        '313103131231112',
        '313103131231120',
        '313103131231121',
        '313103131231130',
        '313103131302002',
        '313103131302020',
        '313103131302022',
        '313103131302200',
        '313103131302202',
        '313103131302220',
        '313103133011022',
        '313103133011023',
        '313103133011032',
        '313103133011221',
        '313103133011302',
        '313103133011320',
        '313103133011322',
    ],
});
