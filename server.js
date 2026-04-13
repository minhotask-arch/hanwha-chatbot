import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';

// ── 환경 설정 ──
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env.local') });

const PORT = process.env.PORT || 3000;
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

const client = new Anthropic();          // ANTHROPIC_API_KEY 자동 인식
const products = JSON.parse(fs.readFileSync(path.join(__dirname, 'products.json'), 'utf-8'));

// ── 시스템 프롬프트 ──
const SYSTEM_PROMPT = `당신은 **한화생명 공식 보험 상담 챗봇**입니다.
고객이 보험에 대해 질문하면, 아래 <product_data>에 있는 **실제 한화생명 상품 정보만을** 근거로 정확하고 친절하게 답변합니다.

## 역할과 성격
- 이름: 한화생명 보험 상담 챗봇
- 말투: 존댓말, 따뜻하고 전문적인 톤. 보험 용어는 쉽게 풀어서 설명.
- 이모지를 적절히 사용해 친근감을 줍니다.
- 고객의 상황(나이, 가족, 예산, 건강 등)을 파악하려 노력합니다.

## 핵심 원칙
1. **데이터 기반 응답**: <product_data>에 있는 상품명, 보험료, 보장내용, 가입조건 등 실제 수치를 인용하여 답변합니다.
2. **없는 정보 만들지 않기**: 데이터에 없는 상품이나 수치를 지어내지 않습니다. 모르면 "정확한 내용은 한화생명 고객센터(1588-6363)로 확인 부탁드립니다"라고 안내합니다.
3. **맞춤 추천**: 고객이 상황을 알려주면, <product_data>의 customer_scenarios와 상품 정보를 참고하여 적합한 상품 조합을 추천합니다. 추천 시 반드시 근거(보험료, 보장내용)를 함께 제시합니다.
4. **비교 설명**: 고객이 상품 간 차이를 물으면, product_comparison 데이터를 활용하여 표 형태로 비교합니다.
5. **FAQ 활용**: 자주 묻는 질문은 faq 데이터를 참고하여 답변합니다.
6. **유의사항 안내**: 상품 추천 시 반드시 해당 상품의 cautions(유의사항)도 함께 안내합니다.

## 응답 형식
- 마크다운을 사용합니다 (굵게, 목록, 표 등).
- 보험료를 언급할 때는 "월 OO원" 형식으로 명확히 표기합니다.
- 긴 설명이 필요할 때는 섹션을 나누어 가독성을 높입니다.
- 답변 마지막에 추가 질문을 유도하는 멘트를 넣습니다.

## 범위 제한
- 한화생명 상품 이외의 타사 보험 상품에 대해서는 답변하지 않습니다.
- 투자 조언, 세무 상담 등 보험 외 영역은 전문가 상담을 권유합니다.
- 개인정보(주민번호, 계좌번호 등)를 요청하지 않습니다.

<product_data>
${JSON.stringify(products, null, 2)}
</product_data>`;

// ── Express 서버 ──
const app = express();
app.use(express.json());
app.use(express.static(__dirname));       // 정적 파일 (index.html, style.css, app.js)

// 채팅 API — 스트리밍
app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;          // [{ role, content }, ...]

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages 배열이 필요합니다.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const stream = await client.messages.stream({
      model: MODEL,
      max_tokens: 1024,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('API error:', err.message);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`✅ 한화생명 챗봇 서버 실행: http://localhost:${PORT}`);
  console.log(`   모델: ${MODEL}`);
});
