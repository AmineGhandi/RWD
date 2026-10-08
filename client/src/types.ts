export type Role = "host" | "player" | "display";
export type Session = {
  code: string;
  token: string;
  role: Role;
  playerId?: string;
};
export type Player = {
  id: string;
  name: string;
  score: number;
  connected: boolean;
};
export type Question = {
  id: string;
  categoryId: string;
  value: number;
  played: boolean;
  text: string | null;
  answer: string | null;
};
export type Room = {
  code: string;
  serverNow: string;
  revision: number;
  phase: string;
  questionId: string | null;
  roundId: string;
  winnerId: string | null;
  attemptId: string | null;
  failedIds: string[];
  deadline: string | null;
  categories: { id: string; name: string }[];
  questions: Question[];
  players: Player[];
  isHost: boolean;
};
export type Action = {
  kind: string;
  questionId?: string;
  roundId?: string;
  attemptId?: string | null;
  correct?: boolean;
  categoryId?: string;
  name?: string;
  edit?: { questionId: string; text: string; answer: string };
  board?: {
    categories: { id: string; name: string }[];
    questions: {
      id: string;
      categoryId: string;
      value: number;
      text: string;
      answer: string;
    }[];
  };
};

