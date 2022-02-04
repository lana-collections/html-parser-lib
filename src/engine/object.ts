import {
  Configurable,
  GeneralSelector,
  Node,
  ParserEngine,
  SelectorOptions,
  SimpleSelector,
  TransformFunction
} from "./base.js";
import { buildTransformList, extractScope, unwrapSelector } from "./common.js";

type ObjectSelectorSupportedSelectors<S extends GeneralSelector> =
  ObjectSelector<S>
  | SimpleSelector
  | S;

export interface ObjectSelector<S extends GeneralSelector> extends GeneralSelector<{ [key: string]: ObjectSelectorSupportedSelectors<S> }> {
  selector: { [key: string]: ObjectSelectorSupportedSelectors<S> };
  objTransforms?: (TransformFunction | string)[];
  object?: boolean;
}

interface ObjectParserEngineOptions<P extends GeneralSelector> {
  engines: (ParserEngine<P> | ObjectParserEngine<P>)[];
  objTransforms: {
    [key: string]: TransformFunction
  };
}

// Parse object values
export class ObjectParserEngine<P extends GeneralSelector> extends ParserEngine<ObjectSelector<P>> implements Configurable<ObjectParserEngineOptions<P>> {
  private options: ObjectParserEngineOptions<P> = { engines: [], objTransforms: {} };

  config(options: Partial<ObjectParserEngineOptions<P>>) {
    // swallow copy, so the ref of engines arrays is kept
    this.options = { ...this.options, ...options };

    // validate registered engine
    const hasOtherEngine = this.options.engines
      .some(engine => !(engine instanceof ObjectParserEngine));
    if (!hasOtherEngine) throw new Error("Object engine cannot work without other engine, Please register at least one other engine. Example: DefaultParserEngine");
  }

  match(selector?: any): boolean {
    if (selector?.object === false) return false;
    if (Array.isArray(selector?.selector)) return false;
    return typeof selector?.selector === "object";
  }

  async parseNode<T>(node: Node, context: ObjectSelector<P>): Promise<T | null> {
    const parsed = {};
    for (const [key, value] of Object.entries(context.selector)) {
      parsed[key] = await this.parseSelectorValue(node, value, context);
    }
    return this.applyTransforms(parsed, context) as T;
  }

  private applyTransforms(value: any, context: ObjectSelector<P>): any | null {
    if (!context.objTransforms || !context.objTransforms.length) return value;
    const transforms = buildTransformList(context.objTransforms, this.options.objTransforms);
    return transforms.reduce((val: any, transform) => transform(val), value);
  }

  private parseSelectorValue(node: Node, value: ObjectSelectorSupportedSelectors<P> | SimpleSelector, context: ObjectSelector<GeneralSelector>): Promise<any | null> {
    const selector = { ...unwrapSelector(value) } as P;
    if (context.trim != null && selector.trim == null) {
      selector.trim = context.trim;
    }
    if (context.transforms && context.transforms.length) {
      selector.transforms = selector.transforms || [];
      // add transform from object to selector transform array. transform from object run last
      selector.transforms = [...selector.transforms, ...context.transforms];
    }
    for (const engine of this.options.engines) {
      if (!engine.match(selector)) continue;
      return engine.parse(node, selector);
    }
    return Promise.resolve(null);
  }
}

export function obj<S extends GeneralSelector>(
  selector: { [key: string]: ObjectSelectorSupportedSelectors<S> },
  opts?: SimpleSelector | SelectorOptions
): ObjectSelector<S> {
  const [scope, options] = extractScope(opts);
  return {
    selector,
    scope,
    ...options
  };
}
