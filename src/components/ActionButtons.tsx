import { useState } from 'react';
import { Copy, Download, Check } from 'lucide-react';

interface ActionButtonsProps {
  markdown: string;
  filename: string;
}

export function ActionButtons({ markdown, filename }: ActionButtonsProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleDownload = () => {
    // Create a blob from the markdown
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);

    // Create a download link
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.replace(/\.[^/.]+$/, '') + '.md';
    document.body.appendChild(a);
    a.click();

    // Cleanup
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex gap-2">
      <button
        onClick={handleCopy}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        {copied ? (
          <>
            <Check className="w-4 h-4" />
            Copied!
          </>
        ) : (
          <>
            <Copy className="w-4 h-4" />
            Copy
          </>
        )}
      </button>

      <button
        onClick={handleDownload}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        <Download className="w-4 h-4" />
        Download
      </button>
    </div>
  );
}
