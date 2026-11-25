import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const actionsPath = path.resolve(__dirname, '../../india/[...slug]/property-actions.tsx');
const messagesClientPath = path.join(__dirname, 'messages-client.tsx');

test('PropertyActions routes enquiry completion to /dashboard/messages with ENQUIRY context and conversationId', () => {
  const src = fs.readFileSync(actionsPath, 'utf8');

  // Enquiry path sets doneHref to /dashboard/messages?contextType=ENQUIRY(&conversationId=...)
  assert.match(src, /const \[doneHref, setDoneHref\] = useState<string>\('\/dashboard\/applications'\)/);
  assert.match(src, /\/dashboard\/messages\?contextType=ENQUIRY&conversationId=\$\{res\.conversationId\}/);
  assert.match(src, /\/dashboard\/messages\?contextType=ENQUIRY/);

  // Application path continues routing to /dashboard/applications
  assert.match(src, /const submitApplication = async \(\) =>[\s\S]*?setDoneHref\('\/dashboard\/applications'\)/);

  // Done confirmation button uses dynamic doneHref rather than hardcoded /dashboard/applications
  assert.match(src, /<Button href=\{doneHref\}/);
  assert.doesNotMatch(src, /<Button href="\/dashboard\/applications"/);
});

test('MessagesClient reads contextType and conversationId query parameters for ENQUIRY deep links', () => {
  const src = fs.readFileSync(messagesClientPath, 'utf8');

  assert.match(src, /const initialConvId = searchParams\.get\('conversationId'\)/);
  assert.match(src, /const rawInitialTab = \(searchParams\.get\('contextType'\) \?\? ''\)\.toUpperCase\(\)/);
  assert.match(
    src,
    /const initialTab = CONTEXT_TABS\.some\(\(t\) => t\.value === rawInitialTab\) \? rawInitialTab : ''/,
  );
  assert.match(src, /const \[activeTab, setActiveTab\] = useState\(initialTab\)/);
});
