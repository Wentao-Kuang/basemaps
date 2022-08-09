import { LogConfig } from '@basemaps/shared';
import { LambdaAlbRequest, LambdaHttpRequest, LambdaUrlRequest } from '@linzjs/lambda';
import { Context } from 'aws-lambda';

export function mockRequest(path: string, method = 'get', headers: Record<string, string> = {}): LambdaHttpRequest {
  return new LambdaAlbRequest(
    {
      requestContext: null as any,
      httpMethod: method.toUpperCase(),
      path: encodeURI(path),
      headers,
      body: null,
      isBase64Encoded: false,
    },
    {} as Context,
    LogConfig.get(),
  );
}

export function mockUrlRequest(
  path: string,
  query = '',
  headers: Record<string, unknown> = {},
  method?: string,
): LambdaHttpRequest {
  return new LambdaUrlRequest(
    {
      requestContext: { http: { method: method ? method.toUpperCase() : 'GET' } },
      headers,
      rawPath: encodeURI(path),
      rawQueryString: query,
      isBase64Encoded: false,
    } as any,
    {} as Context,
    LogConfig.get(),
  );
}

export const Api = {
  key: 'd01f7w7rnhdzg0p7fyrc9v9ard1',
  header: { 'x-linz-api-key': 'd01f7w7rnhdzg0p7fyrc9v9ard1' },
};
