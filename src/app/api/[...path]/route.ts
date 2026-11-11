import { NextRequest } from 'next/server';
import { handle } from '@/server/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest,{params}:{params:Promise<{path:string[]}>}) {return handle(request,(await params).path);}
export const POST=GET;
