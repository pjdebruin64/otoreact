declare const defaultSettings: {
    bAbortOnError: boolean;
    bShowErrors: boolean;
    bStripSpaces: boolean;
    bRunScripts: boolean;
};
export declare function RCompile(elm: HTMLElement, settings?: typeof defaultSettings): RCompiler;
declare type Context = Array<string>;
declare type Environment = Array<unknown>;
declare type Region = {
    parent: Element;
    start: ChildNode;
    end: ChildNode;
    env: Environment;
};
declare type ElmBuilder = (this: RCompiler, reg: Region) => void;
declare type Subscriber = {
    parent: Element;
    marker: ChildNode;
    end: ChildNode;
    env: Environment;
    builder: ElmBuilder;
};
declare class Component {
    TagName: string;
    Parameters: Array<string>;
    Slots: Array<Component>;
    constructor(TagName: string, Parameters?: Array<string>, Slots?: Array<Component>);
    Builders: ElmBuilder[];
    ComponentEnv: Environment;
}
declare class RCompiler {
    private Context;
    private Components;
    instanceNum: number;
    constructor(Context?: Context, Components?: Component[]);
    Compile(elm: HTMLElement, settings: typeof defaultSettings): void;
    Build(reg: Region & {
        marker?: ChildNode;
    }): void;
    private settings;
    private AllRegions;
    private Builder;
    private bCompiled;
    private bHasReacts;
    DirtyRegions: Set<Subscriber>;
    bSomethingDirty: boolean;
    private bUpdating;
    private handleUpdate;
    RUpdate: () => void;
    private DoUpdate;
    RVAR: <T>(name?: string, initialValue?: T, storage?: Store) => _RVAR<T>;
    private rvarList;
    setTimeout: any;
    setInterval: any;
    private RVAR_Light;
    private sourceNodeCount;
    builtNodeCount: number;
    private CompileChildNodes;
    private CompileScript;
    private CompileForeach;
    private CompileParam;
    private CompileInterpolatedString;
    private CompileExpression;
}
interface Store {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}
declare class _RVAR<T> {
    private rRuntime;
    private name?;
    private storage?;
    constructor(rRuntime: RCompiler, name?: string, initialValue?: T, storage?: Store);
    private _Value;
    Subscribers: Set<Subscriber>;
    Subscribe(s: Subscriber): void;
    get V(): T;
    set V(t: T);
    get U(): T;
    set U(t: T);
    SetDirty(): void;
}
export declare let RHTML: RCompiler;
export declare let RVAR: <T>(name?: string, initialValue?: T, storage?: Store) => _RVAR<T>;
export declare let RUpdate: () => void;
export {};
