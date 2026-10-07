const MOODS = ["친절한", "눈치 빠른", "말빨 좋은", "해맑은", "멘탈 갑", "침착한", "단호한", "능청스러운", "다정한", "웃상"];
const ROLES = ["알바생", "점장", "신입", "매니저", "사장님", "인턴", "캐셔", "직원"];

const pick = (xs: string[]) => xs[Math.floor(Math.random() * xs.length)];

/** 닉네임 칸 12자 안에 들어가는 "형용사 + 직책" 조합. */
export const randomNick = () => `${pick(MOODS)} ${pick(ROLES)}`;
