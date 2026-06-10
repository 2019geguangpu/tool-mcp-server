export type FeishuImSender = {
  sender_type?: string;
};

export type FeishuImMessage = {
  message_id: string;
  chat_id: string;
  chat_type?: string;
  thread_id?: string;
  parent_id?: string;
  root_id?: string;
  message_type: string;
  content: string;
};

export type FeishuMessageReceiveEvent = {
  sender?: FeishuImSender;
  message?: FeishuImMessage;
};

export type ParsedFeishuMessage = {
  message: FeishuImMessage;
  sender: FeishuImSender;
  text: string;
  isTopicRoot: boolean;
  isTopicReply: boolean;
};
