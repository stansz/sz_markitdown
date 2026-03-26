import { DocumentConverter } from '../core/types';
import type { DocumentConverterResult, StreamInfo } from '../core/types';
import { mimeTypeMatches, extensionMatches } from '../utils/fileDetection';

const ACCEPTED_MIME_TYPE_PREFIXES = [
  'application/vnd.ms-outlook',
];
const ACCEPTED_FILE_EXTENSIONS = ['.msg'];

/**
 * Converts Outlook .msg files to Markdown
 * Mirrors the Python version's OutlookMsgConverter
 * Uses @kenjiuno/msgreader to parse the OLE compound file structure
 */
export class OutlookMsgConverter extends DocumentConverter {
  accepts(_fileStream: ArrayBuffer, streamInfo: StreamInfo): boolean {
    const mimetype = (streamInfo.mimetype || '').toLowerCase();
    const extension = (streamInfo.extension || '').toLowerCase();

    if (extensionMatches(extension, ACCEPTED_FILE_EXTENSIONS)) {
      return true;
    }

    for (const prefix of ACCEPTED_MIME_TYPE_PREFIXES) {
      if (mimeTypeMatches(mimetype, prefix)) {
        return true;
      }
    }

    return false;
  }

  async convert(
    fileStream: ArrayBuffer,
    streamInfo: StreamInfo
  ): Promise<DocumentConverterResult> {
    const { default: MsgReader } = await import('@kenjiuno/msgreader');

    const reader = new MsgReader(fileStream);
    const data = reader.getFileData();

    if (data.error) {
      throw new Error(`Failed to parse .msg file: ${data.error}`);
    }

    const lines: string[] = ['# Email Message'];

    if (data.subject) {
      lines.push('');
      lines.push(`**Subject:** ${data.subject}`);
    }
    if (data.senderName || data.senderEmail || data.senderSmtpAddress) {
      const senderDisplay = data.senderName
        ? `${data.senderName}${data.senderEmail ? ` <${data.senderEmail}>` : ''}`
        : (data.senderSmtpAddress || data.senderEmail || '');
      if (senderDisplay) {
        lines.push(`**From:** ${senderDisplay}`);
      }
    }

    const recipients = data.recipients;
    if (recipients && recipients.length > 0) {
      const toRecipients = recipients
        .filter(r => r.recipType === 'to')
        .map(r => r.email || r.name)
        .filter(Boolean);
      const ccRecipients = recipients
        .filter(r => r.recipType === 'cc')
        .map(r => r.email || r.name)
        .filter(Boolean);
      const bccRecipients = recipients
        .filter(r => r.recipType === 'bcc')
        .map(r => r.email || r.name)
        .filter(Boolean);

      if (toRecipients.length > 0) {
        lines.push(`**To:** ${toRecipients.join('; ')}`);
      }
      if (ccRecipients.length > 0) {
        lines.push(`**Cc:** ${ccRecipients.join('; ')}`);
      }
      if (bccRecipients.length > 0) {
        lines.push(`**Bcc:** ${bccRecipients.join('; ')}`);
      }
    }

    if (data.clientSubmitTime) {
      lines.push(`**Date:** ${data.clientSubmitTime}`);
    }

    lines.push('');
    lines.push('## Content');
    lines.push('');

    const body = data.bodyHtml || data.body;
    if (body) {
      if (data.bodyHtml) {
        lines.push(body);
      } else {
        lines.push(body.replace(/\r\n/g, '\n').trim());
      }
    }

    return {
      markdown: lines.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
      title: data.subject || streamInfo.filename,
    };
  }
}
