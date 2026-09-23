import type { APIRoute } from 'astro';
import { renderOg } from '../../lib/og';
import toolsData from '../../data/tools.json';
import guidesData from '../../data/guides.json';
import { getToolMeta, type ToolEntry } from '../../lib/tool-meta';

export function getStaticPaths() {
  const toolPaths = (toolsData as ToolEntry[]).map((tool) => ({ params: { slug: tool.slug }, props: { tool } }));
  const guidePaths = (guidesData as { slug: string; title: string; ogSubtitle: string }[]).map((guide) => ({
    params: { slug: guide.slug },
    props: { guide },
  }));
  return [...toolPaths, ...guidePaths];
}

export const GET: APIRoute = async ({ props }) => {
  const { tool, guide } = props as { tool?: ToolEntry; guide?: { title: string; ogSubtitle: string } };
  const png = tool
    ? await renderOg({ title: getToolMeta(tool).h1, subtitle: getToolMeta(tool).ogSubtitle, eyebrow: 'Free · private · no upload' })
    : await renderOg({ title: guide!.title, subtitle: guide!.ogSubtitle, eyebrow: 'Guide' });
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
