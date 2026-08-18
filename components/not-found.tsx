import { ArrowLeft, BookOpen } from "lucide-react";
import { SiteFooter } from "@/components/site-footer";

export function NotFound({ siteName }: { siteName: string }) {
  return (
    <div className="not-found-frame">
      <main className="not-found">
        <span className="material-logo"><BookOpen size={23} /></span>
        <p>404</p>
        <h1>This page is not in the docs.</h1>
        <span>The project or Markdown page does not exist in the current build.</span>
        <a href="/"><ArrowLeft size={16} /> Return to {siteName}</a>
      </main>
      <SiteFooter name={siteName} />
    </div>
  );
}
