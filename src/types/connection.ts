export interface Connection {
  rel: string;
  target: string;
  context: string;
}

/** Raw `- rel :: [[target]]` or `- rel :: [[target]] — context` line */
export type ConnectionLine = string;
