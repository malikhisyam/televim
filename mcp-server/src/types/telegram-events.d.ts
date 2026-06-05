// Type declarations for telegram modules
declare module "telegram/events/index.js" {
  export class NewMessage {
    constructor(params?: { chats?: any; func?: any })
  }
}

declare module "telegram/events/NewMessage" {
  export default class NewMessage {
    constructor(params?: { chats?: any; func?: any })
  }
}
