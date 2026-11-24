/** 주문 코멘트 한 줄 (supabase/migrate-order-comments.sql) */
export interface OrderComment {
  id: string;
  orderId: string;
  authorId: string;
  authorName: string;
  /** 관리자가 쓴 코멘트인가 (아니면 주문자 답글) */
  byAdmin: boolean;
  body: string;
  createdAt: string;
  /** 받는 쪽이 읽은 시각 */
  readAt: string | null;
}

/** 목록에 붙이는 코멘트 표시 */
export interface CommentMark {
  count: number;
  /** 관리자 코멘트를 주문자가 아직 안 읽음 */
  unreadByRequester: boolean;
  /** 주문자 답글을 관리자가 아직 안 읽음 */
  newReply: boolean;
}

export const COMMENT_MAX = 1000;
