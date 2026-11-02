import { env } from 'cloudflare:workers';
import { handleApi } from '../../../server/api.mjs';
export const dynamic = 'force-dynamic';
export const GET = (request: Request) => handleApi(request, env.DB);
export const POST = GET;
export const OPTIONS = GET;
