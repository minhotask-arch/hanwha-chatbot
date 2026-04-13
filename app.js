// ===== 한화생명 보험 상담 챗봇 (Claude API 연동) =====

const chatBody = document.getElementById('chatBody');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const headerTitle = document.getElementById('headerTitle');
const chatHeader = document.querySelector('.chat-header');
const quickActions = document.getElementById('quickActions');

const SEND_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" fill="currentColor"/></svg>';
const STOP_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor"/></svg>';

// ===== 모드 관리 =====
let currentMode = 'customer';   // 'customer' | 'internal'

// 모드별 대화 히스토리 분리
const histories = {
  customer: [],
  internal: [],
};

// 모드별 채팅 내용 보존 (DOM)
const chatSnapshots = {
  customer: null,
  internal: null,
};

let isSending = false;
let abortController = null;

// ===== 모드별 설정 =====
const MODE_CONFIG = {
  customer: {
    title: '한화생명 보험 상담',
    placeholder: '궁금한 보험 상품이나 질문을 입력하세요...',
    headerClass: '',
    quickButtons: [
      { label: '📋 전체 상품 보기', text: '한화생명에 어떤 보험 상품들이 있나요? 전체 목록을 알려주세요.' },
      { label: '🎯 맞춤 추천', text: '제 상황에 맞는 보험을 추천해주세요.' },
      { label: '⚖️ 상품 비교', text: '보험 상품들을 비교해서 설명해주세요.' },
      { label: '❓ 자주 묻는 질문', text: '보험에 대해 자주 묻는 질문들을 알려주세요.' },
    ],
    welcome: `안녕하세요! 😊<br><b>한화생명 보험 상담 챗봇</b>입니다.<br><br>
      보험 상품이 궁금하시거나, 나에게 맞는 보험을 찾고 싶으시면 편하게 말씀해 주세요.<br><br>
      예를 들어 이렇게 물어보실 수 있어요:
      <div class="inline-buttons" style="margin-top:10px">
        <button class="inline-btn" onclick="sendPreset('30대 맞벌이인데 어떤 보험이 좋을까요?', this)">30대 맞벌이 추천</button>
        <button class="inline-btn" onclick="sendPreset('암보험이랑 건강보험 차이가 뭐예요?', this)">암보험 vs 건강보험</button>
        <button class="inline-btn" onclick="sendPreset('월 20만원 예산으로 보험 설계해주세요', this)">월 20만원 설계</button>
        <button class="inline-btn" onclick="sendPreset('비갱신형이 뭔가요?', this)">비갱신형이란?</button>
      </div>`,
  },
  internal: {
    title: '사내 업무 어시스턴트',
    placeholder: '상품 규정, 인수심사, 청구 절차 등을 검색하세요...',
    headerClass: 'internal-mode',
    quickButtons: [
      { label: '📑 인수심사 기준', text: '인수심사 기본 기준을 알려줘.' },
      { label: '📄 보험금 청구 절차', text: '보험금 청구부터 지급까지 절차를 알려줘.' },
      { label: '📞 민원 처리 절차', text: '고객 민원 처리 절차와 에스컬레이션 기준을 알려줘.' },
      { label: '📊 상품 스펙 비교', text: '전 상품 핵심 스펙을 비교 정리해줘.' },
    ],
    welcome: `<b>사내 업무 어시스턴트</b>입니다.<br><br>
      상품 규정, 인수심사 기준, 보험금 청구 절차, 민원 처리 기준 등을 빠르게 조회할 수 있습니다.<br><br>
      자주 찾는 항목:
      <div class="inline-buttons" style="margin-top:10px">
        <button class="inline-btn" onclick="sendPreset('고혈압 고객 인수심사 기준 알려줘', this)">고혈압 인수 기준</button>
        <button class="inline-btn" onclick="sendPreset('암보험 90일 면책기간과 2년 감액 규정 정리해줘', this)">암보험 면책/감액</button>
        <button class="inline-btn" onclick="sendPreset('보험금 청구 필요 서류 리스트', this)">청구 필요 서류</button>
        <button class="inline-btn" onclick="sendPreset('민원 에스컬레이션 기준과 타임라인', this)">민원 에스컬레이션</button>
      </div>`,
  },
};

// ---------- 유틸 ----------
function scrollToBottom() {
  requestAnimationFrame(() => {
    chatBody.scrollTop = chatBody.scrollHeight;
  });
}

function addMessage(html, sender) {
  const wrap = document.createElement('div');
  wrap.className = `message ${sender}`;

  if (sender === 'bot') {
    wrap.innerHTML = `<div class="bot-avatar">H</div><div class="bubble">${html}</div>`;
  } else {
    wrap.innerHTML = `<div class="bubble">${html}</div>`;
  }

  chatBody.appendChild(wrap);
  scrollToBottom();
  return wrap;
}

function addStreamingMessage() {
  const wrap = document.createElement('div');
  wrap.className = 'message bot';
  wrap.innerHTML = `<div class="bot-avatar">H</div><div class="bubble"></div>`;
  chatBody.appendChild(wrap);
  scrollToBottom();
  return wrap.querySelector('.bubble');
}

function showTyping() {
  const el = document.createElement('div');
  el.className = 'message bot typing-indicator';
  el.id = 'typing';
  el.innerHTML = `
    <div class="bot-avatar">H</div>
    <div class="bubble">
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
    </div>`;
  chatBody.appendChild(el);
  scrollToBottom();
}

function hideTyping() {
  const el = document.getElementById('typing');
  if (el) el.remove();
}

function setSendMode() {
  sendBtn.innerHTML = SEND_ICON;
  sendBtn.classList.remove('stop-mode');
  sendBtn.title = '전송';
}

function setStopMode() {
  sendBtn.innerHTML = STOP_ICON;
  sendBtn.classList.add('stop-mode');
  sendBtn.title = '응답 중지';
}

function stopStreaming() {
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
}

// 간단한 마크다운 → HTML 변환
function renderMarkdown(text, streaming) {
  const buttons = [];
  const textWithoutButtons = text.replace(/\[\[(.+?)\]\]/g, (_, label) => {
    buttons.push(label.trim());
    return '';
  });

  let cleaned = textWithoutButtons.replace(/\[\[[^\]]*$/, '');

  let html = cleaned
    .replace(/^(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)+)/gm, (_, header, sep, body) => {
      const thCells = header.split('|').filter(c => c.trim()).map(c => `<th>${c.trim()}</th>`).join('');
      const rows = body.trim().split('\n').map(row => {
        const cells = row.split('|').filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`).join('');
        return `<tr>${cells}</tr>`;
      }).join('');
      return `<table class="compare-table"><thead><tr>${thCells}</tr></thead><tbody>${rows}</tbody></table>`;
    })
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h4 style="margin:10px 0 4px;font-size:13px;color:var(--primary)">$1</h4>')
    .replace(/^## (.+)$/gm, '<h4 style="margin:12px 0 6px;font-size:14px;color:var(--primary)">$1</h4>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul class="detail-features">$&</ul>')
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/\n{2,}/g, '<br><br>')
    .replace(/\n/g, '<br>')
    .replace(/(<br>)+$/, '');

  if (!streaming && buttons.length > 0) {
    html += '<div class="inline-buttons">';
    buttons.forEach(label => {
      const escaped = label.replace(/'/g, "\\'").replace(/"/g, '&quot;');
      html += `<button class="inline-btn" onclick="sendPreset('${escaped}', this)">${label}</button>`;
    });
    html += '</div>';
  }

  return html;
}

// ---------- 모드 전환 ----------
function switchMode(mode) {
  if (mode === currentMode) return;

  // 스트리밍 중이면 중단
  if (isSending) stopStreaming();

  // 현재 채팅 내용 저장
  chatSnapshots[currentMode] = chatBody.innerHTML;

  // 모드 전환
  currentMode = mode;
  const config = MODE_CONFIG[mode];

  // UI 업데이트
  headerTitle.textContent = config.title;
  userInput.placeholder = config.placeholder;
  chatHeader.className = `chat-header ${config.headerClass}`;

  // 탭 활성 상태
  document.querySelectorAll('.mode-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.mode === mode);
  });

  // 퀵 액션 버튼 교체
  quickActions.innerHTML = '';
  config.quickButtons.forEach(qb => {
    const btn = document.createElement('button');
    btn.className = 'quick-btn';
    btn.textContent = qb.label;
    btn.addEventListener('click', () => {
      if (isSending) stopStreaming();
      userInput.value = qb.text;
      setTimeout(() => handleSend(), isSending ? 100 : 0);
    });
    quickActions.appendChild(btn);
  });

  // 채팅 영역 복원 또는 초기화
  if (chatSnapshots[mode]) {
    chatBody.innerHTML = chatSnapshots[mode];
  } else {
    chatBody.innerHTML = '';
    setTimeout(() => addMessage(config.welcome, 'bot'), 300);
  }

  scrollToBottom();
  userInput.focus();
}

// 탭 클릭 이벤트
document.querySelectorAll('.mode-tab').forEach(tab => {
  tab.addEventListener('click', () => switchMode(tab.dataset.mode));
});

// ---------- 프리셋 / 후속 보기 ----------
function sendPreset(text, btn) {
  if (btn) {
    const container = btn.closest('.inline-buttons');
    if (container) {
      container.querySelectorAll('.inline-btn').forEach(b => {
        b.disabled = true;
        b.style.opacity = '0.5';
        b.style.pointerEvents = 'none';
      });
      btn.style.opacity = '1';
      btn.style.borderColor = 'var(--primary)';
      btn.style.color = 'var(--primary)';
    }
  }

  if (isSending) stopStreaming();

  userInput.value = text;
  setTimeout(() => handleSend(), 50);
}
window.sendPreset = sendPreset;

// ---------- API 호출 ----------
async function sendToAPI(text) {
  const history = histories[currentMode];
  history.push({ role: 'user', content: text });

  showTyping();
  isSending = true;
  setStopMode();
  userInput.disabled = false;

  abortController = new AbortController();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history, mode: currentMode }),
      signal: abortController.signal,
    });

    hideTyping();

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`서버 오류 (${res.status}): ${errBody}`);
    }

    const contentType = res.headers.get('Content-Type') || '';

    // SSE 스트리밍 응답 (로컬 server.py)
    if (contentType.includes('text/event-stream')) {
      const bubble = addStreamingMessage();
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6);
            if (data === '[DONE]') break;
            try {
              const parsed = JSON.parse(data);
              if (parsed.error) fullText += `\n\n⚠️ 오류: ${parsed.error}`;
              else if (parsed.text) fullText += parsed.text;
            } catch { /* ignore */ }
          }

          bubble.innerHTML = renderMarkdown(fullText, true);
          scrollToBottom();
        }
      } catch (readErr) {
        if (readErr.name !== 'AbortError') throw readErr;
      }

      bubble.innerHTML = renderMarkdown(fullText, false);
      scrollToBottom();

      if (fullText.trim()) history.push({ role: 'assistant', content: fullText });

    // JSON 응답 (Vercel 서버리스)
    } else {
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const fullText = data.text || '';
      addMessage(renderMarkdown(fullText, false), 'bot');

      if (fullText.trim()) history.push({ role: 'assistant', content: fullText });
    }

    while (history.length > 20) {
      history.shift();
    }

  } catch (err) {
    hideTyping();
    if (err.name !== 'AbortError') {
      addMessage(`죄송합니다, 일시적인 오류가 발생했어요.<br>${err.message}`, 'bot');
    }
  } finally {
    isSending = false;
    abortController = null;
    setSendMode();
    userInput.focus();
  }
}

// ---------- 이벤트 핸들러 ----------
function handleSend() {
  const text = userInput.value.trim();
  if (!text) return;

  if (isSending) {
    stopStreaming();
    const pendingText = text;
    userInput.value = '';
    setTimeout(() => {
      addMessage(pendingText, 'user');
      sendToAPI(pendingText);
    }, 100);
    return;
  }

  addMessage(text, 'user');
  userInput.value = '';
  sendToAPI(text);
}

sendBtn.addEventListener('click', () => {
  if (isSending) {
    if (userInput.value.trim()) {
      handleSend();
    } else {
      stopStreaming();
    }
  } else {
    handleSend();
  }
});

userInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.isComposing) {
    e.preventDefault();
    if (isSending && userInput.value.trim()) {
      handleSend();
    } else if (!isSending) {
      handleSend();
    }
  }
});

// ---------- 사이드바: 상품 목록 ----------
const sidebar = document.getElementById('sidebar');
const sidebarList = document.getElementById('sidebarList');
const sidebarToggle = document.getElementById('sidebarToggle');
const sidebarClose = document.getElementById('sidebarClose');
const sidebarOverlay = document.getElementById('sidebarOverlay');

function closeSidebar() {
  sidebar.classList.remove('open');
  sidebarOverlay.classList.remove('show');
}

sidebarToggle.addEventListener('click', () => {
  sidebar.classList.add('open');
  sidebarOverlay.classList.add('show');
});

sidebarClose.addEventListener('click', closeSidebar);
sidebarOverlay.addEventListener('click', closeSidebar);

async function loadSidebarProducts() {
  try {
    const res = await fetch('products.json');
    const data = await res.json();

    sidebarList.innerHTML = '';
    data.products.forEach(p => {
      const card = document.createElement('div');
      card.className = 'sb-card';
      card.innerHTML = `
        <span class="sb-category">${p.category}</span>
        <div class="sb-name">${p.name.replace('한화생명 ', '')}</div>
        <div class="sb-desc">${p.purpose}</div>`;
      card.addEventListener('click', () => {
        closeSidebar();
        const question = `${p.name}의 주요 특징과 보험료를 알려줘`;
        if (isSending) stopStreaming();
        userInput.value = question;
        setTimeout(() => handleSend(), isSending ? 100 : 0);
      });
      sidebarList.appendChild(card);
    });
  } catch {
    sidebarList.innerHTML = '<div style="color:rgba(255,255,255,.4);font-size:12px;padding:16px">상품 데이터를 불러올 수 없습니다.</div>';
  }
}

// ---------- 초기화 ----------
setSendMode();
loadSidebarProducts();
setTimeout(() => addMessage(MODE_CONFIG.customer.welcome, 'bot'), 500);
