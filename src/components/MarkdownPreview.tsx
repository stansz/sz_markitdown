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
    <div className="border rounded-lg overflow-hidden">
      <div className="bg-muted/50 px-4 py-2 border-b">
        <h3 className="font-medium text-sm">Preview</h3>
      </div>

      <div className="p-4 max-h-[600px] overflow-y-auto">
        <div
          className="prose prose-sm max-w-none dark:prose-invert"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}
