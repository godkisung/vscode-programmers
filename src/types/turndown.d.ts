/**
 * turndown / turndown-plugin-gfm의 최소 타입 선언.
 *
 * 공식 @types/turndown은 HTMLElement·Document 등 DOM 타입에 의존하는데,
 * 이 프로젝트의 tsconfig lib은 ES2020뿐이다. DOM을 추가하면 확장 호스트(Node)에
 * 존재하지 않는 document/window 같은 전역이 컴파일을 통과하게 되므로,
 * 실제로 쓰는 API만 여기에 직접 선언한다.
 */
declare module 'turndown' {
  namespace TurndownService {
    /** turndown이 내부적으로 쓰는 DOM 유사 노드. 필요한 멤버만 노출한다. */
    interface TurndownNode {
      nodeName: string;
      getAttribute(name: string): string | null;
    }

    interface Options {
      headingStyle?: 'setext' | 'atx';
      hr?: string;
      br?: string;
      bulletListMarker?: '-' | '+' | '*';
      codeBlockStyle?: 'indented' | 'fenced';
      fence?: '```' | '~~~';
      emDelimiter?: '_' | '*';
      strongDelimiter?: '__' | '**';
      linkStyle?: 'inlined' | 'referenced';
    }

    type ReplacementFunction = (content: string, node: TurndownNode) => string;

    interface Rule {
      filter: string | string[] | ((node: TurndownNode) => boolean);
      replacement?: ReplacementFunction;
    }

    type Plugin = (service: TurndownService) => void;
  }

  class TurndownService {
    constructor(options?: TurndownService.Options);
    addRule(key: string, rule: TurndownService.Rule): this;
    remove(filter: string | string[]): this;
    use(plugins: TurndownService.Plugin | TurndownService.Plugin[]): this;
    turndown(html: string): string;
  }

  export = TurndownService;
}

declare module 'turndown-plugin-gfm' {
  import type TurndownService from 'turndown';
  export const gfm: (service: TurndownService) => void;
  export const tables: (service: TurndownService) => void;
  export const strikethrough: (service: TurndownService) => void;
  export const taskListItems: (service: TurndownService) => void;
}
