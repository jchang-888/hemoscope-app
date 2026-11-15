// About HemoScope pages for judges: /about-hemoscope (Methods), /machine-learning, /data-used, /validation and /architecture.
// One route file for all five, prerendered at build time. Page content is in app/about-hemoscope/sections.tsx.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ABOUT_PAGES, aboutHref, aboutPageFor } from "../../../lib/methods";
import { PageMain, SiteHeader } from "../../ui";
import { Architecture, DataUsed, MachineLearning, Methods, Validation } from "../sections";

type Props = { params: Promise<{ page?: string[] }> };

// Only the five pages exist. Any other address under /about-hemoscope is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return ABOUT_PAGES.map((p) => ({ page: p.slug ? [p.slug] : [] }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = aboutPageFor((await params).page);
  return { title: page ? `${page.title} | About HemoScope` : "About HemoScope" };
}

const CONTENT = { "": Methods, "machine-learning": MachineLearning, "data-used": DataUsed, validation: Validation, architecture: Architecture };

export default async function AboutPage({ params }: Props) {
  const page = aboutPageFor((await params).page);
  if (!page) notFound();
  const index = ABOUT_PAGES.findIndex((p) => p.slug === page.slug);
  const prev = ABOUT_PAGES[index - 1];
  const next = ABOUT_PAGES[index + 1];
  const Content = CONTENT[page.slug];
  const link = "btn !px-4 !py-2";

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <PageMain className="space-y-6">
        <Link href="/" className="inline-block text-sm font-semibold text-accent-text underline">Back to Demo</Link>
        <h1 className="font-heading text-3xl font-bold sm:text-4xl">{page.title}</h1>
        <Content />
        <nav aria-label="Page navigation" className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
          {prev ? <Link href={aboutHref(prev.slug)} className={link}>Previous: {prev.title}</Link> : <span />}
          {next ? <Link href={aboutHref(next.slug)} className={link}>Next: {next.title}</Link> : <span />}
        </nav>
      </PageMain>
    </div>
  );
}
