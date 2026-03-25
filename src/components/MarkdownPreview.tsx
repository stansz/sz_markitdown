import { marked } from 'marked';

interface MarkdownPreviewProps {
  markdown: string;
}

export function MarkdownPreview({ markdown }: MarkdownPreviewProps) {
  // Configure marked options
  marked.setOptions({
    breaks: true,
    gfm: true,
  });

  // Convert markdown to HTML
  const html = marked.parse(markdown) as string;

  return (
    <div className="border rounded-xl overflow-hidden shadow-sm bg-card">
      <div className="bg-muted/40 px-4 py-3 border-b flex items-center justify-between">
        <h3 className="font-semibold text-sm">Preview</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
            Markdown
          </span>
        </div>
      </div>

      <div className="p-5 max-h-[500px] overflow-y-auto bg-card/50">
        <div
          className="prose prose-sm max-w-none 
            prose-headings:font-semibold prose-headings:tracking-tight
            prose-h1:text-xl prose-h2:text-lg prose-h3:text-base
            prose-p:leading-relaxed prose-p:text-foreground/90
            prose-a:text-primary prose-a:no-underline hover:prose-a:underline
            prose-code:bg-muted/80 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-sm
            prose-pre:bg-muted/60 prose-pre:rounded-lg
            prose-blockquote:border-l-primary/50 prose-blockquote:bg-muted/30 prose-blockquote:px-4 prose-blockquote:rounded-r-lg
            prose-li:marker:text-muted-foreground/60
            prose-img:rounded-lg prose-img:shadow-sm
            dark:prose-invert
            prose-primary:text-primary"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}
