// game.js
// index.html, style.css와 같은 폴더에 저장하세요.
// 학생 6명이 담긴 원본 그림의 경로: images/students.png

"use strict";

const byId = (id) => document.getElementById(id);

const STUDENT_COUNT = 6;
const IMAGE_PATH = "./images/students.png";
const studentSheet = new Image();

const actions = [
  { id: "phone", name: "몰폰", clue: "📱" },
  { id: "leave", name: "출튀", clue: "" },
  { id: "glasses", name: "AI 안경", clue: "👓 AI 답변" },
  { id: "snack", name: "간식", clue: "🍪 바삭!" }
];

// count는 기억할 학생 수, clueMs는 행동 하나가 보이는 시간입니다.
const practiceLevel = { name: "연습", count: 1, clueMs: 4000 };

const levels = [
  { name: "쉬움", count: 1, clueMs: 3000 },
  { name: "보통", count: 2, clueMs: 2200 },
  { name: "어려움", count: 3, clueMs: 1500 },
  { name: "매우 어려움", count: 4, clueMs: 1000 }
];

let practiceMode = false;
let roundIndex = 0;
let phase = "home";
let roundEvents = [];
let answers = new Map();
let selectedSeat = null;
let records = [];
let timerId = null;

// ── 공통 기능 ──────────────────────────────

function shuffle(items) {
  const result = [...items];

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

function currentLevel() {
  return practiceMode ? practiceLevel : levels[roundIndex];
}

function totalScore() {
  return records.reduce((sum, record) => sum + record.points, 0);
}

function showScreen(screenId) {
  for (const id of ["home", "game", "result"]) {
    byId(id).hidden = id !== screenId;
  }
}

function stopTimer() {
  clearTimeout(timerId);
  timerId = null;
}

function makeButton(text, onClick, className = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  button.className = className;
  button.addEventListener("click", onClick);
  return button;
}

// ── 학생 이미지와 좌석 ────────────────────────

// 원본 그림은 윗줄 3명, 아랫줄 3명입니다.
// 한 학생 크기의 창을 만들고 그림을 이동해 해당 학생만 보여줍니다.
function makePortrait(index) {
  const frame = document.createElement("span");
  frame.className = "portrait";

  // 앞에서 사용한 CSS 버전이 달라도 그림을 잘라 표시할 수 있게 합니다.
  Object.assign(frame.style, {
    display: "block",
    position: "relative",
    width: "min(80px, 100%)",
    aspectRatio: "1 / 1",
    flexShrink: "1",
    minHeight: "0",
    overflow: "hidden",
    borderRadius: "9px 9px 0 0"
  });

  const picture = studentSheet.cloneNode(false);
  picture.alt = "";
  picture.draggable = false;

  const column = index % 3;
  const row = Math.floor(index / 3);

  Object.assign(picture.style, {
    display: "block",
    position: "absolute",
    width: "300%",
    height: "200%",
    maxWidth: "none",
    left: `${-100 * column}%`,
    top: `${-100 * row}%`,
    pointerEvents: "none"
  });

  frame.append(picture);
  return frame;
}

function drawClassroom(activeEvent = null) {
  const room = byId("classroom");
  room.replaceChildren();

  for (let index = 0; index < STUDENT_COUNT; index++) {
    let visibleEvent = null;

    if (phase === "review") {
      visibleEvent = roundEvents.find(event => event.seat === index);
    } else if (phase === "watch" && activeEvent?.seat === index) {
      visibleEvent = activeEvent;
    }

    const isEmpty = visibleEvent?.action.id === "leave";
    const seat = makeButton("", () => selectSeat(index), "seat");

    seat.disabled = phase !== "answer";
    seat.setAttribute("aria-label", `${index + 1}번 자리`);
    seat.setAttribute("aria-pressed", String(selectedSeat === index));

    seat.classList.toggle("selected", selectedSeat === index);
    seat.classList.toggle("recorded", phase === "answer" && answers.has(index));
    seat.classList.toggle("correct", phase === "review" && Boolean(visibleEvent));
    seat.classList.toggle("acting", Boolean(visibleEvent) && !isEmpty);

    if (isEmpty) {
      const chair = document.createElement("span");
      chair.className = "empty-chair";
      chair.textContent = "🪑";
      seat.append(chair);
    } else {
      // 관찰 중에도, 답을 고를 때도 학생 그림을 표시합니다.
      seat.append(makePortrait(index));
    }

    const desk = document.createElement("span");
    desk.className = "desk";

    // 입력한 행동을 책상 번호 옆에 표시해 학생 얼굴을 가리지 않습니다.
    const picked = phase === "answer" ? answers.get(index) : null;
    desk.textContent = picked
      ? `${index + 1}번 · ${picked.name}`
      : `${index + 1}번`;

    seat.append(desk);

    if (visibleEvent?.action.clue) {
      const clue = document.createElement("span");
      clue.className = "clue";
      clue.textContent = visibleEvent.action.clue;
      seat.append(clue);
    }

    room.append(seat);
  }
}

// ── 게임 시작과 행동 출제 ──────────────────────

function makeRoundEvents() {
  const count = currentLevel().count;
  const seatNumbers = Array.from(
    { length: STUDENT_COUNT },
    (_, index) => index
  );

  const seats = shuffle(seatNumbers);

  const chosenActions = practiceMode
    ? [actions[0]]
    : shuffle(actions).slice(0, count);

  // 출튀는 마지막에 보여줘서 나간 학생이 관찰 도중 다시 나타나지 않게 합니다.
  const orderedActions = [
    ...chosenActions.filter(action => action.id !== "leave"),
    ...chosenActions.filter(action => action.id === "leave")
  ];

  return orderedActions.map((action, index) => ({
    seat: seats[index],
    action
  }));
}

function startGame(isPractice) {
  stopTimer();

  practiceMode = isPractice;
  roundIndex = 0;
  records = [];

  showScreen("game");
  startRound();
}

function startRound() {
  stopTimer();

  phase = "watch";
  selectedSeat = null;
  answers = new Map();
  roundEvents = makeRoundEvents();

  const level = currentLevel();
  const room = byId("classroom");

  // 이전 버전에 있던 좌석 가림 스타일이 적용되지 않도록 합니다.
  room.classList.remove("seat-map");
  room.hidden = false;

  byId("blackboard").hidden = true;
  byId("action-panel").hidden = true;
  byId("answer-panel").hidden = true;

  byId("round-title").textContent = practiceMode
    ? "연습 수업"
    : `${roundIndex + 1}교시 · ${level.name}`;

  byId("message").textContent = practiceMode
    ? "학생들의 자리를 살펴보세요. 잠시 후 한 학생이 휴대폰을 꺼냅니다."
    : `${level.count}명의 자리와 행동을 기억하세요. 각 행동은 ${level.clueMs / 1000}초 동안 보입니다.`;

  byId("score").textContent = practiceMode
    ? "연습은 점수에서 제외"
    : `현재 ${totalScore()}점`;

  byId("timer").textContent = "관찰 준비";
  drawClassroom();

  // 딴짓이 시작되기 전에 1.8초 동안 학생 전체를 보여줍니다.
  timerId = setTimeout(() => showEvent(0), 1800);
}

function showEvent(eventIndex) {
  const event = roundEvents[eventIndex];

  function reveal() {
    byId("blackboard").hidden = true;
    byId("classroom").hidden = false;
    byId("timer").textContent =
      `관찰 중 · ${eventIndex + 1}/${roundEvents.length}`;

    drawClassroom(event);

    timerId = setTimeout(() => {
      const isLastEvent = eventIndex === roundEvents.length - 1;

      if (isLastEvent) {
        beginAnswer();
        return;
      }

      // 두 행동 사이에는 잠시 평소 모습을 보여줍니다.
      drawClassroom();
      byId("timer").textContent = "계속 관찰하세요";
      timerId = setTimeout(() => showEvent(eventIndex + 1), 750);
    }, currentLevel().clueMs);
  }

  if (event.action.id === "leave") {
    byId("classroom").hidden = true;
    byId("blackboard").hidden = false;
    byId("timer").textContent = "판서 중";

    timerId = setTimeout(reveal, 700);
  } else {
    reveal();
  }
}

// ── 학생과 행동 선택 ─────────────────────────

function beginAnswer() {
  phase = "answer";
  selectedSeat = null;

  byId("classroom").hidden = false;
  byId("blackboard").hidden = true;
  byId("action-panel").hidden = false;

  byId("message").textContent =
    `학생 ${roundEvents.length}명의 자리와 행동을 입력하세요. 입력 순서는 자유입니다.`;

  // 모든 학생을 평소 모습으로 보여주고, 행동 단서만 숨깁니다.
  drawClassroom();
  updateAnswerPanel();
}

function selectSeat(index) {
  if (phase !== "answer") return;

  if (!answers.has(index) && answers.size >= roundEvents.length) {
    byId("message").textContent =
      "입력할 인원을 모두 채웠어요. 자리를 바꾸려면 입력한 자리를 눌러 답을 지워 주세요.";
    return;
  }

  selectedSeat = index;
  drawClassroom();
  updateAnswerPanel();
}

function updateAnswerPanel() {
  const count = roundEvents.length;
  const container = byId("action-buttons");
  container.replaceChildren();

  byId("timer").textContent = `입력 ${answers.size}/${count}명`;

  if (selectedSeat === null) {
    byId("action-title").textContent = answers.size === count
      ? "입력한 답을 확인하고 제출하세요."
      : "학생을 클릭한 뒤 행동을 선택하세요.";
  } else {
    byId("action-title").textContent =
      `${selectedSeat + 1}번 학생이 한 행동은 무엇인가요?`;

    for (const action of actions) {
      container.append(
        makeButton(action.name, () => saveAnswer(action))
      );
    }
  }

  const tools = document.createElement("div");
  tools.className = "answer-tools";

  if (selectedSeat !== null && answers.has(selectedSeat)) {
    tools.append(makeButton("이 자리 답 지우기", () => {
      answers.delete(selectedSeat);
      selectedSeat = null;

      byId("message").textContent = "답을 지웠어요. 다른 자리를 선택할 수 있어요.";
      drawClassroom();
      updateAnswerPanel();
    }));
  }

  const submit = makeButton("최종 제출", gradeRound, "primary");
  submit.disabled = answers.size !== count;

  tools.append(submit);
  container.append(tools);
}

function saveAnswer(action) {
  if (phase !== "answer" || selectedSeat === null) return;

  // 같은 자리의 답을 다시 고르면 기존 행동을 수정합니다.
  answers.set(selectedSeat, action);
  selectedSeat = null;

  const remaining = roundEvents.length - answers.size;

  byId("message").textContent = remaining === 0
    ? "입력이 끝났어요. 책상 번호 옆의 답을 확인한 뒤 제출하세요."
    : `다음 학생을 선택하세요. ${remaining}명 남았어요.`;

  drawClassroom();
  updateAnswerPanel();
}

// ── 채점과 최종 결과 ─────────────────────────

function gradeRound() {
  if (phase !== "answer" || answers.size !== roundEvents.length) return;

  phase = "review";
  selectedSeat = null;

  let seatHits = 0;
  let fullHits = 0;

  const reviewList = document.createElement("ul");
  reviewList.className = "round-review";

  for (const event of roundEvents) {
    const picked = answers.get(event.seat);
    let points = 0;

    if (picked) {
      seatHits++;
      points++;

      if (picked.id === event.action.id) {
        fullHits++;
        points++;
      }
    }

    const item = document.createElement("li");
    item.textContent =
      `${event.seat + 1}번 · 정답 ${event.action.name} / ` +
      `내 답 ${picked?.name ?? "미선택"} (${points}/2점)`;

    reviewList.append(item);
  }

  const points = seatHits + fullHits;
  const maximum = roundEvents.length * 2;

  if (!practiceMode) {
    records.push({ points, maximum, seatHits, fullHits });
    byId("score").textContent = `현재 ${totalScore()}점`;
  }

  byId("action-panel").hidden = true;
  byId("answer-panel").hidden = false;
  byId("timer").textContent = "정답 공개";
  byId("message").textContent = "초록색으로 표시된 자리가 딴짓한 학생입니다.";

  byId("answer-title").textContent =
    `${practiceMode ? "연습" : "이번 교시"} 점수 ${points}/${maximum}점`;

  byId("answer-detail").textContent =
    `학생 지목 성공 ${seatHits}명 · 행동까지 정답 ${fullHits}명`;

  const myAnswer = byId("my-answer");

  myAnswer.textContent = "내가 입력한 답: " + Array.from(
    answers,
    ([seat, action]) => `${seat + 1}번 ${action.name}`
  ).join(", ");

  byId("answer-panel").querySelector(".round-review")?.remove();
  myAnswer.after(reviewList);

  const next = byId("next");

  if (practiceMode) {
    next.textContent = "본 수업 시작";
  } else if (roundIndex === levels.length - 1) {
    next.textContent = "최종 결과 보기";
  } else {
    next.textContent = "다음 교시";
  }

  drawClassroom();
  next.focus();
}

function showResult() {
  phase = "result";
  showScreen("result");

  const maximum = records.reduce((sum, record) => sum + record.maximum, 0);
  const seatHits = records.reduce((sum, record) => sum + record.seatHits, 0);
  const fullHits = records.reduce((sum, record) => sum + record.fullHits, 0);
  const eventCount = levels.reduce((sum, level) => sum + level.count, 0);

  byId("final-score").textContent = `${totalScore()} / ${maximum}점`;

  byId("final-summary").textContent =
    `총 ${eventCount}건 중 학생 지목 성공 ${seatHits}건 · 행동까지 정답 ${fullHits}건`;

  const list = byId("round-records");
  list.replaceChildren();

  records.forEach((record, index) => {
    const item = document.createElement("li");
    item.textContent =
      `${index + 1}교시 · ${levels[index].name} — ` +
      `${record.points}/${record.maximum}점`;

    list.append(item);
  });

  byId("restart").focus();
}

// ── 버튼 연결과 이미지 불러오기 ─────────────────

byId("practice").addEventListener("click", () => startGame(true));
byId("start").addEventListener("click", () => startGame(false));
byId("restart").addEventListener("click", () => startGame(false));

byId("restart").addEventListener("click", () => {
  stopTimer();
  phase = "home";
  showScreen("home");

  byId("score").textContent = `출석 인원 ${STUDENT_COUNT}명`;
  byId("practice").focus();
});

byId("practice").disabled = true;
// 시작 버튼은 이미지 로딩과 관계없이 사용할 수 있게 한다.
byId("practice").disabled = false;
byId("start").disabled = false;

// 예전 HTML에 안내 문구가 없는 경우에도 게임이 실행되도록 한다.
const imageStatus = byId("image-status");

if (imageStatus) {
  imageStatus.hidden = false;
  imageStatus.textContent = "학생 그림을 불러오는 중입니다…";
}

studentSheet.onload = () => {
  if (imageStatus) {
    imageStatus.hidden = true;
  }
};

studentSheet.onerror = () => {
  const warning = document.createElement("p");
  warning.className = "notice";
  warning.setAttribute("role", "alert");
  warning.textContent =
    "학생 그림을 열 수 없어요. images 폴더 안에 students.png가 있는지 확인해 주세요.";

  if (imageStatus) {
    imageStatus.hidden = true;
  }

  // 수업을 이미 시작했어도 오류 안내가 보이도록 한다.
  document.querySelector("main").prepend(warning);
};

// 정답 공개 화면에서 '다음 교시' 버튼을 눌렀을 때
byId("next").onclick = () => {
  // 1. 연습이 끝나면 본게임 1교시 시작
  if (practiceMode) {
    startGame(false);
    return;
  }

  // 2. 마지막 교시가 끝나면 최종 결과 표시
  if (roundIndex >= levels.length - 1) {
    showResult();
    return;
  }

  // 3. 다음 교시로 이동
  roundIndex += 1;
  startRound();
};

studentSheet.src = IMAGE_PATH;