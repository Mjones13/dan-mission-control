import { NextResponse } from 'next/server';
import { getDevPreviewMetadataResponse } from '@/lib/dev-preview-metadata';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(getDevPreviewMetadataResponse());
}
