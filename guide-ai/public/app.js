const uploadForm = document.getElementById('uploadForm');
const manualZip = document.getElementById('manualZip');
const uploadStatus = document.getElementById('uploadStatus');
const manualSelect = document.getElementById('manualSelect');
const chatForm = document.getElementById('chatForm');
const questionInput = document.getElementById('question');
const chat = document.getElementById('chat');
const includeScreenshotsInput = document.getElementById('includeScreenshots');

async function loadManuals() {
  const res = await fetch('/api/manuals');
  const manuals = await res.json();
  manualSelect.innerHTML = '';
  if (!manuals.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No manuals uploaded yet';
    manualSelect.appendChild(opt);
    return;
  }
  for (const m of manuals) {
    const opt = document.createElement('option');
    opt.value = m.manualId;
    opt.textContent = `${m.name} (${new Date(m.createdAt).toLocaleString()})`;
    manualSelect.appendChild(opt);
  }
}

function addMessage(type, content, imageUrl, meta) {
  const div = document.createElement('div');
  div.className = `msg ${type}`;
  if (type === 'agent') {
    const pre = document.createElement('pre');
    pre.textContent = content;
    div.appendChild(pre);
    if (imageUrl) {
      const img = document.createElement('img');
      img.src = imageUrl;
      img.alt = 'Annotated screenshot';
      div.appendChild(img);
    }
    if (meta) {
      const small = document.createElement('div');
      small.className = 'small';
      small.textContent = meta;
      div.appendChild(small);
    }
  } else {
    div.textContent = content;
  }
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

uploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const file = manualZip.files[0];
  if (!file) return;
  uploadStatus.textContent = 'Uploading ZIP and indexing documentation...';
  const fd = new FormData();
  fd.append('manualZip', file);
  try {
    const res = await fetch('/api/upload-manual', { method: 'POST', body: fd });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Upload failed');
    uploadStatus.textContent = `Indexed ${json.screenshotCount} screenshots. Manual ID: ${json.manualId}`;
    await loadManuals();
    manualSelect.value = json.manualId;
  } catch (err) {
    uploadStatus.textContent = `Error: ${err.message}`;
  }
});

chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const manualId = manualSelect.value;
  const question = questionInput.value.trim();
  if (!manualId || !question) return;
  const includeScreenshots = includeScreenshotsInput ? includeScreenshotsInput.checked : true;
  addMessage('user', `${question}${includeScreenshots ? '' : '  [text-only]'}`);
  questionInput.value = '';
  addMessage('agent', 'Thinking...');
  const placeholder = chat.lastElementChild;
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manualId, question, includeScreenshots })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Chat failed');
    placeholder.remove();
    const meta = !json.includeScreenshots
      ? 'Screenshots turned off for this answer.'
      : (json.chosenScreenshot ? `Screenshot: ${json.chosenScreenshot}${json.targetLabel ? ` • Highlight: ${json.targetLabel}` : ''}` : 'No screenshot selected.');
    addMessage('agent', json.answer, json.includeScreenshots ? (json.annotatedImageUrl || json.originalImageUrl) : null, meta);
  } catch (err) {
    placeholder.remove();
    addMessage('agent', `Error: ${err.message}`);
  }
});

loadManuals();
