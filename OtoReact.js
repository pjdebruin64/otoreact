const defaultSettings = {
    bTiming: false,
    bAbortOnError: false,
    bShowErrors: true,
    bRunScripts: false,
    bBuild: true,
    rootPattern: '/',
    preformatted: [],
    bNoGlobals: false,
    bDollarRequired: false,
    bSetPointer: true,
    bKeepWhiteSpace: false,
    bKeepComments: false,
};
var WSpc;
(function (WSpc) {
    WSpc[WSpc["block"] = 1] = "block";
    WSpc[WSpc["inlineSpc"] = 2] = "inlineSpc";
    WSpc[WSpc["inline"] = 3] = "inline";
    WSpc[WSpc["preserve"] = 4] = "preserve";
})(WSpc || (WSpc = {}));
class Range {
    constructor(node, text) {
        this.node = node;
        this.text = text;
        this.next = null;
        if (!node)
            this.child = null;
    }
    toString() { return this.text || this.node?.nodeName; }
    get First() {
        let f;
        if (f = this.node)
            return f;
        let child = this.child;
        while (child) {
            if (f = child.First)
                return f;
            child = child.next;
        }
        return this.endMark || null;
    }
    Nodes() {
        return (function* Nodes(r) {
            if (r.node)
                yield r.node;
            else {
                let child = r.child;
                while (child) {
                    yield* Nodes(child);
                    child = child.next;
                }
            }
            if (r.endMark)
                yield r.endMark;
        })(this);
    }
    get isConnected() {
        const f = this.First;
        return f && f.isConnected;
    }
}
const DUndef = _ => undefined;
function PrepArea(srcElm, area, text = '', bMark, result) {
    let { parent, env, range, before, endMark } = area, subArea = { parent, env, range: null, }, bInit = !range;
    if (bInit) {
        subArea.source = area.source;
        if (srcElm)
            text = `${srcElm.localName}${text ? ' ' : ''}${text}`;
        UpdatePrevArea(area, range = subArea.parentR = new Range(null, text));
        range.result = result;
        if (bMark)
            before = range.before =
                endMark !== undefined ? endMark
                    : range.endMark = parent.insertBefore(document.createComment('/' + text), before);
    }
    else {
        subArea.range = range.child;
        area.range = range.next;
        if (bMark) {
            before = range.before;
            if (bMark == 1 && result != range.result || bMark == 2) {
                range.result = result;
                let node = range.First || before;
                while (node != before) {
                    const next = node.nextSibling;
                    parent.removeChild(node);
                    node = next;
                }
                range.child = null;
                subArea.range = null;
                subArea.parentR = range;
                bInit = true;
            }
        }
    }
    subArea.endMark = (subArea.before = before) || area.endMark;
    return { range, subArea, bInit };
}
function UpdatePrevArea(area, range) {
    let r;
    if (r = area.parentR) {
        r.child = range;
        area.parentR = null;
    }
    else if (r = area.prevR)
        r.next = range;
    area.prevR = range;
}
function PrepareElement(srcElm, area, nodeName = srcElm.nodeName) {
    let elmRange = area.range, bInit = !elmRange;
    if (bInit) {
        const elm = (area.source == srcElm
            ? (srcElm.innerHTML = "", srcElm)
            : area.parent.insertBefore(document.createElement(nodeName), area.before));
        elmRange = new Range(elm);
        UpdatePrevArea(area, elmRange);
    }
    else {
        area.range = elmRange.next;
    }
    return { elmRange,
        childArea: { parent: elmRange.node, range: elmRange.child,
            before: null, endMark: null,
            env: area.env,
            parentR: elmRange
        },
        bInit };
}
function PrepText(area, content, bComm) {
    let range = area.range;
    if (!range) {
        range = new Range(area.parent.insertBefore(bComm ? document.createComment(content) : document.createTextNode(content), area.before));
        UpdatePrevArea(area, range);
    }
    else {
        range.node.data = content;
        area.range = range.next;
    }
}
let RootPath = null;
let ToBuild = [];
export function RCompile(elm, settings) {
    try {
        const { rootPattern } = R.Settings = { ...defaultSettings, ...settings }, m = location.href.match(`^.*(${rootPattern})`);
        R.FilePath = location.origin + (globalThis.RootPath = RootPath = m ? (new URL(m[0])).pathname.replace(/[^/]*$/, '') : '');
        R.RootElm = elm;
        R.Compile(elm, {}, true);
        ToBuild.push({ parent: elm.parentElement, env: NewEnv(), source: elm, range: null });
        return (R.Settings.bBuild
            ? RBuild()
            : null);
    }
    catch (err) {
        window.alert(`OtoReact error: ${err}`);
    }
}
export async function RBuild() {
    R.start = performance.now();
    R.builtNodeCount = 0;
    try {
        for (const area of ToBuild)
            await R.InitialBuild(area);
        R.logTime(`Built ${R.builtNodeCount} nodes in ${(performance.now() - R.start).toFixed(1)} ms`);
        ScrollToHash();
    }
    catch (err) {
        window.alert(`OtoReact error: ${err}`);
    }
    ToBuild = [];
}
function NewEnv() {
    const env = [];
    env.constructs = new Map();
    return env;
}
function CloneEnv(env) {
    const clone = env.slice();
    clone.constructs = new Map(env.constructs.entries());
    return clone;
}
class Signature {
    constructor(srcElm) {
        this.srcElm = srcElm;
        this.Params = [];
        this.RestParam = null;
        this.Slots = new Map();
        this.name = srcElm.localName;
    }
    IsCompatible(sig) {
        if (!sig)
            return false;
        let result = true;
        const mapSigParams = new Map(sig.Params.map(p => [p.name, p.pDefault]));
        for (const { name, pDefault } of this.Params)
            if (mapSigParams.has(name)) {
                result &&= (!pDefault || mapSigParams.get(name));
                mapSigParams.delete(name);
            }
            else
                result = false;
        for (const pDefault of mapSigParams.values())
            result &&= pDefault;
        for (let [slotname, slotSig] of this.Slots)
            result &&= sig.Slots.get(slotname)?.IsCompatible(slotSig);
        return !!result;
    }
}
const gEval = eval;
var ModType;
(function (ModType) {
    ModType[ModType["Attr"] = 0] = "Attr";
    ModType[ModType["Prop"] = 1] = "Prop";
    ModType[ModType["Src"] = 2] = "Src";
    ModType[ModType["Class"] = 3] = "Class";
    ModType[ModType["Style"] = 4] = "Style";
    ModType[ModType["Event"] = 5] = "Event";
    ModType[ModType["AddToStyle"] = 6] = "AddToStyle";
    ModType[ModType["AddToClassList"] = 7] = "AddToClassList";
    ModType[ModType["RestArgument"] = 8] = "RestArgument";
    ModType[ModType["oncreate"] = 9] = "oncreate";
    ModType[ModType["onupdate"] = 10] = "onupdate";
})(ModType || (ModType = {}));
let bReadOnly = false;
function ApplyModifier(elm, modType, name, val, bCreate) {
    switch (modType) {
        case ModType.Attr:
            elm.setAttribute(name, val);
            break;
        case ModType.Src:
            elm.setAttribute('src', new URL(val, name).href);
            break;
        case ModType.Prop:
            if (val !== undefined && val !== elm[name])
                elm[name] = val;
            break;
        case ModType.Event:
            let m;
            if (val)
                if (m = /^on(input|change)$/.exec(name)) {
                    elm.addEventListener(m[1], val);
                    elm.handlers.push({ evType: m[1], listener: val });
                }
                else {
                    if (R.Settings.bSetPointer && /^onclick$/.test(name))
                        elm.style.cursor = val && !elm.disabled ? 'pointer' : null;
                    elm[name] = val;
                }
            break;
        case ModType.Class:
            if (val)
                elm.classList.add(name);
            break;
        case ModType.Style:
            elm.style[name] = val || (val === 0 ? '0' : null);
            break;
        case ModType.AddToStyle:
            if (val)
                for (const [name, v] of Object.entries(val))
                    elm.style[name] = v || (v === 0 ? '0' : null);
            break;
        case ModType.AddToClassList:
            switch (typeof val) {
                case 'string':
                    elm.classList.add(val);
                    break;
                case 'object':
                    if (val)
                        if (Array.isArray(val))
                            for (const name of val)
                                elm.classList.add(name);
                        else
                            for (const [name, bln] of Object.entries(val))
                                if (bln)
                                    elm.classList.add(name);
                    break;
                default: throw `Invalid '+class' value`;
            }
            break;
        case ModType.RestArgument:
            for (const { modType, name, value } of val || [])
                ApplyModifier(elm, modType, name, value, bCreate);
            break;
        case ModType.oncreate:
            if (bCreate)
                val.call(elm);
        case ModType.onupdate:
            if (!bCreate)
                val.call(elm);
            break;
    }
}
function ApplyModifiers(elm, modifiers, env, bCreate) {
    for (const { modType, name, depValue } of modifiers) {
        try {
            bReadOnly = true;
            const value = depValue.bThis ? depValue.call(elm, env) : depValue(env);
            bReadOnly = false;
            ApplyModifier(elm, modType, name, value, bCreate);
        }
        catch (err) {
            throw `[${name}]: ${err}`;
        }
    }
}
const RModules = new Map();
const envActions = [];
function SaveEnv() {
    return envActions.length;
}
function RestoreEnv(savedEnv) {
    for (let j = envActions.length; j > savedEnv; j--)
        envActions.pop()();
}
function DefConstruct(env, name, construct) {
    const { constructs } = env, prevDef = constructs.get(name);
    constructs.set(name, construct);
    envActions.push(() => { constructs.set(name, prevDef); });
}
class RCompiler {
    constructor(clone) {
        this.clone = clone;
        this.instanceNum = RCompiler.iNum++;
        this.cRvars = new Map();
        this.restoreActions = [];
        this.mPreformatted = new Set(['pre']);
        this.AllAreas = [];
        this.wspc = WSpc.block;
        this.rspc = 1;
        this.bCompiled = false;
        this.DirtyVars = new Set();
        this.DirtySubs = new Map();
        this.bUpdating = false;
        this.bUpdate = false;
        this.handleUpdate = null;
        this.sourceNodeCount = 0;
        this.builtNodeCount = 0;
        this.context = clone?.context || "";
        this.ContextMap = clone ? new Map(clone.ContextMap) : new Map();
        this.CSignatures = clone ? new Map(clone.CSignatures) : new Map();
        this.Settings = clone ? { ...clone.Settings } : { ...defaultSettings };
        this.AddedHeaderElements = clone?.AddedHeaderElements || [];
        this.head = clone?.head || document.head;
        this.StyleBefore = clone?.StyleBefore;
        this.FilePath = clone?.FilePath || location.origin + RootPath;
    }
    get MainC() { return this.clone || this; }
    SaveContext() {
        return this.restoreActions.length;
    }
    RestoreContext(savedContext) {
        for (let j = this.restoreActions.length; j > savedContext; j--)
            this.restoreActions.pop()();
    }
    NewVar(name) {
        let init;
        if (!name)
            init = ((_) => (_) => { });
        else {
            name = CheckValidIdentifier(name);
            const i = this.ContextMap.get(name);
            if (i == null) {
                const savedContext = this.context, i = this.ContextMap.size;
                this.ContextMap.set(name, i);
                this.context += `${name},`;
                this.restoreActions.push(() => {
                    this.ContextMap.delete(name);
                    this.context = savedContext;
                });
                init = ((env) => {
                    envActions.push(() => { env.length = i; });
                    return (value) => { env[i] = value; };
                });
            }
            else
                init = ((env) => {
                    const prev = env[i];
                    envActions.push(() => { env[i] = prev; });
                    return (value) => { env[i] = value; };
                });
        }
        init.varName = name;
        return init;
    }
    AddConstruct(C) {
        const Cnm = C.name, savedConstr = this.CSignatures.get(Cnm);
        this.CSignatures.set(Cnm, C);
        this.restoreActions.push(() => this.CSignatures.set(Cnm, savedConstr));
    }
    Compile(elm, settings = {}, bIncludeSelf = false) {
        const t0 = performance.now();
        Object.assign(this.Settings, settings);
        for (const tag of this.Settings.preformatted)
            this.mPreformatted.add(tag.toLowerCase());
        const savedR = R;
        try {
            if (!this.clone)
                R = this;
            this.Builder =
                bIncludeSelf
                    ? this.CompElement(elm.parentElement, elm, true)[0]
                    : this.CompChildNodes(elm);
            this.bCompiled = true;
        }
        finally {
            R = savedR;
        }
        const t1 = performance.now();
        this.logTime(`Compiled ${this.sourceNodeCount} nodes in ${(t1 - t0).toFixed(1)} ms`);
    }
    logTime(msg) {
        if (this.Settings.bTiming)
            console.log(msg);
    }
    Subscriber({ parent, before, bNoChildBuilding, env }, builder, range, ...args) {
        const sArea = {
            parent, before, bNoChildBuilding,
            env: CloneEnv(env),
            range,
        }, subscriber = () => {
            this.builtNodeCount++;
            return builder.call(this, { ...sArea }, ...args);
        };
        subscriber.sArea = sArea;
        subscriber.ref = before;
        return subscriber;
    }
    async InitialBuild(area) {
        const savedRCompiler = R, { parentR } = area;
        R = this;
        this.builtNodeCount++;
        await this.Builder(area);
        const subs = this.Subscriber(area, this.Builder, parentR ? parentR.child : area.prevR);
        this.AllAreas.push(subs);
        R = savedRCompiler;
    }
    AddDirty(sub) {
        this.DirtySubs.set(sub.ref, sub);
    }
    RUpdate() {
        this.MainC.bUpdate = true;
        if (!this.clone && !this.bUpdating && !this.handleUpdate)
            this.handleUpdate = setTimeout(() => {
                this.handleUpdate = null;
                this.DoUpdate();
            }, 5);
    }
    ;
    async DoUpdate() {
        if (!this.bCompiled || this.bUpdating) {
            this.bUpdate = true;
            return;
        }
        for (let i = 0; i < 2; i++) {
            this.bUpdate = false;
            this.bUpdating = true;
            let savedRCompiler = R;
            try {
                for (const rvar of this.DirtyVars)
                    rvar.Save();
                this.DirtyVars.clear();
                if (this.DirtySubs.size) {
                    if (!this.clone)
                        R = this;
                    this.start = performance.now();
                    this.builtNodeCount = 0;
                    const subs = this.DirtySubs;
                    this.DirtySubs = new Map();
                    for (const sub of subs.values()) {
                        if (!sub.ref || sub.ref.isConnected)
                            try {
                                await sub();
                            }
                            catch (err) {
                                const msg = `ERROR: ${err}`;
                                console.log(msg);
                                window.alert(msg);
                            }
                    }
                    this.logTime(`Updated ${this.builtNodeCount} nodes in ${(performance.now() - this.start).toFixed(1)} ms`);
                }
            }
            finally {
                R = savedRCompiler;
                this.bUpdating = false;
            }
            if (!this.bUpdate)
                break;
        }
    }
    RVAR(name, initialValue, store, subs, storeName = name) {
        const r = new _RVAR(this.MainC, name, initialValue, store, storeName);
        if (subs)
            r.Subscribe(subs, true, false);
        return r;
    }
    ;
    RVAR_Light(t, updatesTo) {
        if (!t._Subscribers) {
            t._Subscribers = new Set();
            t._UpdatesTo = updatesTo;
            const R = this.MainC;
            Object.defineProperty(t, 'U', { get: () => {
                    for (const sub of t._Subscribers)
                        R.AddDirty(sub);
                    if (t._UpdatesTo?.length)
                        for (const rvar of t._UpdatesTo)
                            rvar.SetDirty();
                    else
                        R.RUpdate();
                    return t;
                }
            });
            t.Subscribe = (sub) => { t._Subscribers.add(sub); };
        }
        return t;
    }
    CompChildNodes(srcParent, childNodes = srcParent.childNodes) {
        const saved = this.SaveContext();
        try {
            const builder = this.CompIterator(srcParent, childNodes);
            return builder ?
                async function ChildNodes(area) {
                    const savedEnv = SaveEnv();
                    try {
                        await builder.call(this, area);
                    }
                    finally {
                        RestoreEnv(savedEnv);
                    }
                }
                : async () => { };
        }
        finally {
            this.RestoreContext(saved);
        }
    }
    CompIterator(srcParent, iter) {
        const builders = [], { rspc } = this, arr = Array.from(iter), L = arr.length;
        let i = 0;
        for (const srcNode of arr) {
            i++;
            this.rspc = i == L && rspc;
            let builder;
            switch (srcNode.nodeType) {
                case Node.ELEMENT_NODE:
                    this.sourceNodeCount++;
                    builder = this.CompElement(srcParent, srcNode);
                    break;
                case Node.TEXT_NODE:
                    this.sourceNodeCount++;
                    let str = srcNode.nodeValue;
                    const getText = this.CompString(str), { fixed } = getText;
                    if (fixed !== '') {
                        builder =
                            [fixed
                                    ? async (area) => PrepText(area, fixed)
                                    : async (area) => PrepText(area, getText(area.env)), srcNode,
                                fixed == ' '];
                        if (this.wspc < WSpc.preserve)
                            this.wspc = /\s$/.test(str) ? WSpc.inlineSpc : WSpc.inline;
                    }
                    break;
                case Node.COMMENT_NODE:
                    if (this.Settings.bKeepComments) {
                        const getText = this.CompString(srcNode.nodeValue, 'Comment');
                        builder =
                            [async (area) => PrepText(area, getText(area.env), true), srcNode, 1];
                    }
                    break;
            }
            if (builder ? builder[0].ws : this.rspc) {
                let i = builders.length - 1, isB;
                while (i >= 0 && (isB = builders[i][2])) {
                    if (isB === true)
                        builders.splice(i, 1);
                    i--;
                }
            }
            if (builder)
                builders.push(builder);
        }
        if (rspc) {
            let i = builders.length - 1, isB;
            while (i >= 0 && (isB = builders[i][2])) {
                if (isB === true)
                    builders.splice(i, 1);
                i--;
            }
        }
        if (!builders.length)
            return null;
        const Iter = async function Iter(area, start = 0) {
            let i = 0;
            if (!area.range) {
                const { endMark } = area;
                area.endMark = undefined;
                const toSubscribe = [];
                let ref;
                for (const [builder] of builders) {
                    i++;
                    if (i == builders.length)
                        area.endMark = endMark;
                    await builder.call(this, area);
                    if (builder.auto)
                        toSubscribe.push(this.Subscriber(area, Iter, area.prevR, i));
                    if (!ref && area.prevR)
                        ref = area.prevR.node || area.prevR.endMark;
                }
                for (const subs of toSubscribe) {
                    const { sArea } = subs, { range } = sArea, rvar = range.value;
                    if (!rvar._Subscribers.size && ref) {
                        sArea.range = range.next;
                        subs.ref = ref;
                        rvar.Subscribe(rvar.auto = subs);
                    }
                }
            }
            else
                for (const [builder] of builders)
                    if (i++ >= start) {
                        const r = area.range;
                        await builder.call(this, area);
                        if (builder.auto) {
                            const rvar = r.value;
                            if (rvar.auto)
                                rvar.auto.sArea.env = CloneEnv(area.env);
                        }
                    }
            this.builtNodeCount += builders.length - start;
        };
        Iter.ws = builders[0][0].ws;
        return Iter;
    }
    CompElement(srcParent, srcElm, bUnhide) {
        const atts = new Atts(srcElm), reacts = [], genMods = [];
        if (bUnhide)
            atts.set('#hidden', 'false');
        let builder, elmBuilder, isBlank;
        try {
            let m;
            for (const attName of atts.keys())
                if (m = RCompiler.genAtts.exec(attName))
                    if (m[3])
                        genMods.push({ attName,
                            bCr: /create|\*/.test(attName),
                            bUpd: /update|\+/.test(attName),
                            text: atts.get(attName) });
                    else {
                        reacts.push({ attName, rvars: this.compAttrExprList(atts, attName, true) });
                    }
            const construct = this.CSignatures.get(srcElm.localName);
            if (construct)
                builder = this.CompInstance(srcElm, atts, construct);
            else {
                switch (srcElm.localName) {
                    case 'def':
                    case 'define':
                        {
                            const rvarName = atts.get('rvar'), varName = rvarName || atts.get('let') || atts.get('var', true), getStore = rvarName && this.CompAttrExpr(atts, 'store'), bReact = CBool(atts.get('reacting') ?? atts.get('updating')), getValue = this.CompParameter(atts, 'value', DUndef), newVar = this.NewVar(varName);
                            if (rvarName) {
                                atts.get('async');
                                const a = this.cRvars.get(rvarName);
                                this.cRvars.set(rvarName, true);
                                this.restoreActions.push(() => {
                                    elmBuilder.auto = this.cRvars.get(rvarName);
                                    this.cRvars.set(rvarName, a);
                                });
                            }
                            builder = async function DEF(area) {
                                const { range, bInit } = PrepArea(srcElm, area), { env } = area;
                                if (bInit || bReact) {
                                    const value = getValue(env);
                                    if (rvarName)
                                        if (bInit)
                                            range.value = new _RVAR(this.MainC, null, value, getStore && getStore(env), rvarName);
                                        else
                                            range.value.SetAsync(value);
                                    else
                                        range.value = value;
                                }
                                newVar(env)(range.value);
                            };
                            isBlank = 1;
                        }
                        break;
                    case 'if':
                    case 'case':
                        {
                            const bHiding = CBool(atts.get('hiding')), getVal = this.CompAttrExpr(atts, 'value'), caseNodes = [], body = [];
                            let bThen = false;
                            for (const node of srcElm.childNodes) {
                                if (node.nodeType == Node.ELEMENT_NODE)
                                    switch (node.nodeName) {
                                        case 'THEN':
                                            bThen = true;
                                            new Atts(node).CheckNoAttsLeft();
                                            caseNodes.push({ node: node, atts, body: node.childNodes });
                                            continue;
                                        case 'ELSE':
                                        case 'WHEN':
                                            caseNodes.push({ node: node, atts: new Atts(node), body: node.childNodes });
                                            continue;
                                    }
                                body.push(node);
                            }
                            if (!bThen)
                                if (srcElm.nodeName == 'IF')
                                    caseNodes.unshift({ node: srcElm, atts, body });
                                else
                                    atts.CheckNoAttsLeft();
                            const caseList = [], { wspc, rspc } = this;
                            let postWs = 0, elseWs = wspc;
                            for (let { node, atts, body } of caseNodes) {
                                const saved = this.SaveContext();
                                this.wspc = wspc;
                                this.rspc = rspc;
                                try {
                                    let cond = null, not = false;
                                    let patt = null;
                                    switch (node.nodeName) {
                                        case 'WHEN':
                                        case 'IF':
                                        case 'THEN':
                                            cond = this.CompAttrExpr(atts, 'cond');
                                            not = CBool(atts.get('not')) || false;
                                            let pattern;
                                            patt =
                                                (pattern = atts.get('match')) != null
                                                    ? this.CompPattern(pattern)
                                                    : (pattern = atts.get('urlmatch')) != null
                                                        ? this.CompPattern(pattern, true)
                                                        : (pattern = atts.get('regmatch')) != null
                                                            ? { regex: new RegExp(pattern, 'i'),
                                                                lvars: (atts.get('captures')?.split(',') || []).map(this.NewVar.bind(this))
                                                            }
                                                            : null;
                                            if (bHiding && patt?.lvars.length)
                                                throw `Pattern capturing cannot be combined with hiding`;
                                            if (patt && !getVal)
                                                throw `Match requested but no 'value' specified.`;
                                        case 'ELSE':
                                            const builder = this.CompChildNodes(node, body);
                                            caseList.push({ cond, not, patt, builder, node });
                                            atts.CheckNoAttsLeft();
                                            postWs = Math.max(postWs, this.wspc);
                                            if (not === undefined)
                                                elseWs = 0;
                                            continue;
                                    }
                                }
                                catch (err) {
                                    throw (node.nodeName == 'IF' ? '' : OuterOpenTag(node)) + err;
                                }
                                finally {
                                    this.RestoreContext(saved);
                                }
                            }
                            this.wspc = Math.max(postWs, elseWs);
                            builder =
                                async function CASE(area) {
                                    const { env } = area, value = getVal && getVal(env);
                                    let choosenAlt = null;
                                    let matchResult;
                                    for (const alt of caseList)
                                        try {
                                            if (!((!alt.cond || alt.cond(env))
                                                && (!alt.patt || (matchResult = alt.patt.regex.exec(value)))) == alt.not) {
                                                choosenAlt = alt;
                                                break;
                                            }
                                        }
                                        catch (err) {
                                            throw (alt.node.nodeName == 'IF' ? '' : OuterOpenTag(alt.node)) + err;
                                        }
                                    if (bHiding) {
                                        for (const alt of caseList) {
                                            const { elmRange, childArea, bInit } = PrepareElement(alt.node, area);
                                            const bHidden = elmRange.node.hidden = alt != choosenAlt;
                                            if ((!bHidden || bInit) && !area.bNoChildBuilding)
                                                await this.CallWithHandling(alt.builder, alt.node, childArea);
                                        }
                                    }
                                    else {
                                        const { subArea, bInit } = PrepArea(srcElm, area, '', 1, choosenAlt);
                                        if (choosenAlt && (bInit || !area.bNoChildBuilding)) {
                                            const saved = SaveEnv();
                                            try {
                                                if (choosenAlt.patt) {
                                                    let i = 1;
                                                    for (const lvar of choosenAlt.patt.lvars)
                                                        lvar(env)((choosenAlt.patt.url ? decodeURIComponent : (r) => r)(matchResult[i++]));
                                                }
                                                await this.CallWithHandling(choosenAlt.builder, choosenAlt.node, subArea);
                                            }
                                            finally {
                                                RestoreEnv(saved);
                                            }
                                        }
                                    }
                                };
                        }
                        break;
                    case 'for':
                    case 'foreach':
                        builder = this.CompFor(srcParent, srcElm, atts);
                        break;
                    case 'include':
                        {
                            const src = atts.get('src', true);
                            let C = new RCompiler(this);
                            C.FilePath = this.GetPath(src);
                            const task = (async () => {
                                const textContent = await this.FetchText(src);
                                const parser = new DOMParser();
                                const parsedContent = parser.parseFromString(textContent, 'text/html');
                                C.Compile(parsedContent.body, { bRunScripts: true }, false);
                            })();
                            builder =
                                async function INCLUDE(area) {
                                    const t0 = performance.now();
                                    await task;
                                    this.start += performance.now() - t0;
                                    await C.Builder(area);
                                    this.builtNodeCount += C.builtNodeCount;
                                };
                        }
                        break;
                    case 'import':
                        {
                            const src = this.GetURL(atts.get('src', true));
                            const listImports = new Array();
                            for (const child of srcElm.children) {
                                const sign = this.ParseSignature(child);
                                listImports.push(sign);
                                this.AddConstruct(sign);
                            }
                            const C = new RCompiler();
                            C.FilePath = this.GetPath(src);
                            C.Settings = { ...this.Settings, bRunScripts: true };
                            let promiseModule = RModules.get(src);
                            if (!promiseModule) {
                                promiseModule = this.FetchText(src)
                                    .then(textContent => {
                                    const parser = new DOMParser(), parsedDoc = parser.parseFromString(textContent, 'text/html'), builder = C.CompIterator(null, concIterable(parsedDoc.head.children, parsedDoc.body.children));
                                    for (const clientSig of listImports) {
                                        const signature = C.CSignatures.get(clientSig.name);
                                        if (!signature)
                                            throw `<${clientSig.name}> is missing in '${src}'`;
                                        if (!clientSig.IsCompatible(signature))
                                            throw `Import signature ${clientSig.srcElm.outerHTML} is incompatible with module signature ${signature.srcElm.outerHTML}`;
                                    }
                                    return builder;
                                });
                                RModules.set(src, promiseModule);
                            }
                            builder = async function IMPORT({ env }) {
                                const builder = await promiseModule, mEnv = NewEnv();
                                await builder.call(C, { parent: document.createDocumentFragment(), start: null, bInit: true, env: mEnv });
                                for (const { name } of listImports)
                                    DefConstruct(env, name, mEnv.constructs.get(name));
                            };
                            isBlank = 1;
                        }
                        break;
                    case 'react':
                        {
                            const getRvars = this.compAttrExprList(atts, 'on', true);
                            const getHashes = this.compAttrExprList(atts, 'hash');
                            const bodyBuilder = this.CompChildNodes(srcElm);
                            builder = this.GetREACT(srcElm, 'on', bodyBuilder, getRvars, CBool(atts.get('renew')));
                            if (getHashes) {
                                const b = builder;
                                builder = async function HASH(area) {
                                    const { subArea, range } = PrepArea(srcElm, area, 'hash');
                                    const hashes = getHashes(area.env);
                                    if (!range.value || hashes.some((hash, i) => hash !== range.value[i])) {
                                        range.value = hashes;
                                        await b.call(this, subArea);
                                    }
                                };
                                builder.ws = b.ws;
                            }
                        }
                        break;
                    case 'rhtml':
                        {
                            const getSrctext = this.CompParameter(atts, 'srctext');
                            const modifs = this.CompAttributes(atts);
                            this.wspc = WSpc.block;
                            builder = async function RHTML(area) {
                                const srctext = getSrctext(area.env);
                                const { elmRange, bInit } = PrepareElement(srcElm, area, 'rhtml-rhtml'), { node } = elmRange;
                                ApplyModifiers(node, modifs, area.env, bInit);
                                if (area.prevR || srctext != elmRange.result) {
                                    elmRange.result = srctext;
                                    const shadowRoot = node.shadowRoot || node.attachShadow({ mode: 'open' }), tempElm = document.createElement('rhtml');
                                    try {
                                        tempElm.innerHTML = srctext;
                                        if (elmRange.hdrElms) {
                                            for (const elm of elmRange.hdrElms)
                                                elm.remove();
                                            elmRange.hdrElms = null;
                                        }
                                        const R = new RCompiler();
                                        ;
                                        (R.head = shadowRoot).innerHTML = '';
                                        R.Compile(tempElm, { bRunScripts: true, bTiming: this.Settings.bTiming }, false);
                                        elmRange.hdrElms = R.AddedHeaderElements;
                                        const subArea = { parent: shadowRoot, range: null, env: NewEnv(), parentR: new Range(null, 'Shadow') };
                                        await R.InitialBuild(subArea);
                                        this.builtNodeCount += R.builtNodeCount;
                                    }
                                    catch (err) {
                                        shadowRoot.appendChild(createErrorNode(`Compile error: ${err}`));
                                    }
                                }
                            };
                        }
                        break;
                    case 'script':
                        builder = this.CompScript(srcParent, srcElm, atts);
                        isBlank = 1;
                        break;
                    case 'style':
                        this.CompStyle(srcElm);
                        isBlank = 1;
                        break;
                    case 'component':
                        builder = this.CompComponent(srcParent, srcElm, atts);
                        isBlank = 1;
                        break;
                    case 'document':
                        {
                            const newVar = this.NewVar(atts.get('name', true)), bEncaps = CBool(atts.get('encapsulate')), params = atts.get('params'), RC = this, saved = this.SaveContext(), setVars = (params?.split(',') || []).map(v => this.NewVar(v));
                            try {
                                const docBuilder = RC.CompChildNodes(srcElm), docDef = (env) => {
                                    env = CloneEnv(env);
                                    return {
                                        async render(parent, args) {
                                            parent.innerHTML = '';
                                            const saved = SaveEnv();
                                            let i = 0;
                                            for (const init of setVars)
                                                init(env)(args[i++]);
                                            try {
                                                await docBuilder.call(RC, { parent, env });
                                            }
                                            finally {
                                                RestoreEnv(saved);
                                            }
                                        },
                                        open(target, features, ...args) {
                                            const W = window.open('', target, features);
                                            W.addEventListener('keydown', function (event) { if (event.key == 'Escape')
                                                this.close(); });
                                            if (!bEncaps)
                                                copyStyleSheets(document, W.document);
                                            this.render(W.document.body, args);
                                            return W;
                                        },
                                        async print(...args) {
                                            const iframe = document.createElement('iframe');
                                            iframe.setAttribute('style', 'display:none');
                                            document.body.appendChild(iframe);
                                            if (!bEncaps)
                                                copyStyleSheets(document, iframe.contentDocument);
                                            await this.render(iframe.contentDocument.body, args);
                                            iframe.contentWindow.print();
                                            iframe.remove();
                                        }
                                    };
                                };
                                builder = async function DOCUMENT({ env }) {
                                    newVar(env)(docDef(env));
                                };
                                isBlank = 1;
                            }
                            finally {
                                this.RestoreContext(saved);
                            }
                        }
                        ;
                        break;
                    case 'head.':
                        {
                            const childBuilder = this.CompChildNodes(srcElm);
                            builder = function HEAD({ parent, env }) {
                                const head = parent.ownerDocument.head;
                                return childBuilder.call(this, { parent: head, env });
                            };
                            isBlank = 1;
                        }
                        ;
                        break;
                    default:
                        builder = this.CompHTMLElement(srcElm, atts);
                        break;
                }
                atts.CheckNoAttsLeft();
            }
            for (const g of genMods)
                g.handler = this.CompHandler(g.attName, g.text);
        }
        catch (err) {
            throw `${OuterOpenTag(srcElm)} ${err}`;
        }
        if (!builder)
            return null;
        if (genMods.length) {
            const b = builder;
            builder = async function ON(area) {
                const { range } = area;
                await b.call(this, area);
                for (const g of genMods)
                    if (range ? g.bUpd : g.bCr)
                        g.handler(area.env).call((range || area.prevR).node);
            };
        }
        for (const { attName, rvars } of reacts)
            builder = this.GetREACT(srcElm, attName, builder, rvars);
        elmBuilder = function Elm(area) {
            return this.CallWithHandling(builder, srcElm, area);
        };
        elmBuilder.ws = builder.ws;
        return [elmBuilder, srcElm];
    }
    GetREACT(srcElm, attName, builder, getRvars, bRenew = false) {
        const updateBuilder = (bRenew
            ? function renew(subArea) {
                const subsubArea = PrepArea(srcElm, subArea, 'renew', 2).subArea;
                return builder.call(this, subsubArea);
            }
            : /^this/.test(attName)
                ? function reacton(subArea) {
                    subArea.bNoChildBuilding = true;
                    return builder.call(this, subArea);
                }
                : builder);
        async function REACT(area) {
            const { range, subArea, bInit } = PrepArea(srcElm, area, attName, true);
            await builder.call(this, bRenew ? PrepArea(srcElm, subArea, 'renew', 2).subArea : subArea);
            if (getRvars) {
                const rvars = getRvars(area.env);
                let subscriber, pVars;
                if (bInit)
                    subscriber = this.Subscriber(subArea, updateBuilder, range.child);
                else {
                    ({ subscriber, rvars: pVars } = range.value);
                    subscriber.sArea.env = CloneEnv(subArea.env);
                }
                range.value = { rvars, subscriber };
                let i = 0;
                for (const rvar of rvars) {
                    if (pVars) {
                        const pvar = pVars[i++];
                        if (rvar == pvar)
                            continue;
                        pvar._Subscribers.delete(subscriber);
                    }
                    try {
                        rvar.Subscribe(subscriber);
                    }
                    catch {
                        throw `[${attName}] This is not an RVAR`;
                    }
                }
            }
        }
        REACT.ws = builder.ws;
        return REACT;
    }
    async CallWithHandling(builder, srcNode, area) {
        let { range } = area;
        if (range && range.errorNode) {
            area.parent.removeChild(range.errorNode);
            range.errorNode = undefined;
        }
        try {
            return await builder.call(this, area);
        }
        catch (err) {
            const message = srcNode instanceof HTMLElement ? `${OuterOpenTag(srcNode, 40)} ${err}` : err;
            if (this.Settings.bAbortOnError)
                throw message;
            console.log(message);
            if (this.Settings.bShowErrors) {
                const errorNode = area.parent.insertBefore(createErrorNode(message), area.range?.First);
                if (range)
                    range.errorNode = errorNode;
            }
        }
    }
    CompScript(srcParent, srcElm, atts) {
        const bModule = atts.get('type')?.toLowerCase() == 'module', bNoModule = atts.get('nomodule') != null, defines = atts.get('defines');
        let src = atts.get('src');
        let builder;
        if (bNoModule || this.Settings.bRunScripts) {
            let script = srcElm.text + '\n';
            const lvars = [];
            if (defines)
                for (const name of defines.split(','))
                    lvars.push({ name, init: this.NewVar(name) });
            let exports;
            builder = async function SCRIPT({ env }) {
                if (!(bModule || bNoModule || defines || !this.clone)) {
                    if (!exports) {
                        const e = srcElm.cloneNode(true);
                        document.head.appendChild(e);
                        this.AddedHeaderElements.push(e);
                        exports = {};
                    }
                }
                else if (bModule) {
                    if (!exports) {
                        if (src)
                            exports = await import(this.GetURL(src));
                        else
                            try {
                                script = script.replace(/(\sfrom\s*['"])([^'"]*)(['"])/g, (_, p1, p2, p3) => `${p1}${this.GetURL(p2)}${p3}`);
                                const src = URL.createObjectURL(new Blob([script], { type: 'application/javascript' }));
                                exports = await import(src);
                            }
                            finally {
                                URL.revokeObjectURL(src);
                            }
                    }
                    for (const { name, init } of lvars) {
                        if (!(name in exports))
                            throw `'${name}' is not exported by this script`;
                        init(env)(exports[name]);
                    }
                }
                else {
                    if (!exports) {
                        if (src)
                            script = await this.FetchText(src);
                        exports = gEval(`'use strict'\n;${script};[${defines}]\n`);
                    }
                    let i = 0;
                    for (const { init } of lvars)
                        init(env)(exports[i++]);
                }
            };
        }
        else if (defines)
            throw `You must add 'nomodule' if this script has to define OtoReact variables`;
        atts.clear();
        return builder;
    }
    CompFor(srcParent, srcElm, atts) {
        const varName = atts.get('let') ?? atts.get('var');
        let indexName = atts.get('index');
        if (indexName == '')
            indexName = 'index';
        const saved = this.SaveContext();
        try {
            if (varName != null) {
                let prevName = atts.get('previous');
                if (prevName == '')
                    prevName = 'previous';
                let nextName = atts.get('next');
                if (nextName == '')
                    nextName = 'next';
                const getRange = this.CompAttrExpr(atts, 'of', true), getUpdatesTo = this.CompAttrExpr(atts, 'updates'), bReactive = CBool(atts.get('updateable') ?? atts.get('reactive')) || !!getUpdatesTo, initVar = this.NewVar(varName), initIndex = this.NewVar(indexName), initPrevious = this.NewVar(prevName), initNext = this.NewVar(nextName), getKey = this.CompAttrExpr(atts, 'key'), getHash = this.CompAttrExpr(atts, 'hash'), bodyBuilder = this.CompChildNodes(srcElm);
                return async function FOR(area) {
                    const { range, subArea } = PrepArea(srcElm, area, '', true), { parent, env } = subArea, savedEnv = SaveEnv();
                    try {
                        const keyMap = range.value ||= new Map(), newMap = new Map(), setVar = initVar(env), setIndex = initIndex(env);
                        let iterable = getRange(env);
                        if (iterable) {
                            if (iterable instanceof Promise)
                                iterable = await iterable;
                            if (!(iterable[Symbol.iterator] || iterable[Symbol.asyncIterator]))
                                throw `[of]: Value (${iterable}) is not iterable`;
                            let idx = 0;
                            for await (const item of iterable) {
                                setVar(item);
                                setIndex(idx);
                                const hash = getHash && getHash(env);
                                const key = getKey ? getKey(env) : hash;
                                if (key != null && newMap.has(key))
                                    throw `Key '${key}' is not unique`;
                                newMap.set(key ?? {}, { item, hash, idx });
                                idx++;
                            }
                        }
                        let nextChild = range.child;
                        const setPrevious = initPrevious(env), setNext = initNext(env), iterator = newMap.entries(), nextIterator = nextName ? newMap.values() : null;
                        let prevItem, nextItem, prevRange = null, childArea;
                        subArea.parentR = range;
                        subArea.endMark = undefined;
                        if (nextIterator)
                            nextIterator.next();
                        while (true) {
                            let k;
                            while (nextChild && !newMap.has(k = nextChild.key)) {
                                if (k != null)
                                    keyMap.delete(k);
                                for (const node of nextChild.Nodes())
                                    parent.removeChild(node);
                                nextChild.prev = null;
                                nextChild = nextChild.next;
                            }
                            const { value } = iterator.next();
                            if (!value)
                                break;
                            const [key, { item, hash, idx }] = value;
                            if (nextIterator)
                                nextItem = nextIterator.next().value?.item;
                            let childRange = keyMap.get(key), bInit = !childRange;
                            if (bInit) {
                                subArea.range = null;
                                subArea.prevR = prevRange;
                                subArea.before = nextChild?.First || range.endMark;
                                ;
                                ({ range: childRange, subArea: childArea } = PrepArea(null, subArea, `${varName}(${idx})`, true));
                                if (key != null) {
                                    if (keyMap.has(key))
                                        throw `Duplicate key '${key}'`;
                                    keyMap.set(key, childRange);
                                }
                                childRange.key = key;
                            }
                            else {
                                if (childRange.fragm) {
                                    const nextNode = nextChild?.First || range.endMark;
                                    parent.insertBefore(childRange.fragm, nextNode);
                                    childRange.fragm = null;
                                }
                                else
                                    while (true) {
                                        if (nextChild == childRange)
                                            nextChild = nextChild.next;
                                        else {
                                            const nextIndex = newMap.get(nextChild.key)?.idx;
                                            if (nextIndex > idx + 2) {
                                                const fragm = nextChild.fragm = document.createDocumentFragment();
                                                for (const node of nextChild.Nodes())
                                                    fragm.appendChild(node);
                                                nextChild = nextChild.next;
                                                continue;
                                            }
                                            childRange.prev.next = childRange.next;
                                            if (childRange.next)
                                                childRange.next.prev = childRange.prev;
                                            const nextNode = nextChild?.First || range.endMark;
                                            for (const node of childRange.Nodes())
                                                parent.insertBefore(node, nextNode);
                                        }
                                        break;
                                    }
                                childRange.text = `${varName}(${idx})`;
                                if (prevRange)
                                    prevRange.next = childRange;
                                else
                                    range.child = childRange;
                                subArea.range = childRange;
                                childArea = PrepArea(null, subArea, '', true).subArea;
                                subArea.parentR = null;
                            }
                            childRange.prev = prevRange;
                            prevRange = childRange;
                            if (hash == null
                                || hash != childRange.hash
                                    && (childRange.hash = hash, true)) {
                                let rvar;
                                if (bReactive) {
                                    if (item === childRange.rvar)
                                        rvar = item;
                                    else {
                                        rvar = this.RVAR_Light(item, getUpdatesTo && [getUpdatesTo(env)]);
                                        if (childRange.rvar)
                                            rvar._Subscribers = childRange.rvar._Subscribers;
                                    }
                                }
                                setVar(rvar || item);
                                setIndex(idx);
                                setPrevious(prevItem);
                                if (nextIterator)
                                    setNext(nextItem);
                                await bodyBuilder.call(this, childArea);
                                if (rvar && !childRange.rvar)
                                    rvar.Subscribe(this.Subscriber(childArea, bodyBuilder, childRange.child));
                                childRange.rvar = rvar;
                            }
                            prevItem = item;
                        }
                        if (prevRange)
                            prevRange.next = null;
                        else
                            range.child = null;
                    }
                    finally {
                        RestoreEnv(savedEnv);
                    }
                };
            }
            else {
                const slotName = atts.get('of', true, true).toLowerCase();
                const slot = this.CSignatures.get(slotName);
                if (!slot)
                    throw `Missing attribute [let]`;
                const initIndex = this.NewVar(indexName);
                const bodyBuilder = this.CompChildNodes(srcElm);
                return async function FOREACH_Slot(area) {
                    const { subArea } = PrepArea(srcElm, area), { env } = subArea, saved = SaveEnv(), slotDef = env.constructs.get(slotName), setIndex = initIndex(area.env);
                    subArea.endMark = undefined;
                    try {
                        let index = 0;
                        for (const slotBuilder of slotDef.templates) {
                            setIndex(index++);
                            env.constructs.set(slotName, { templates: [slotBuilder], constructEnv: slotDef.constructEnv });
                            await bodyBuilder.call(this, subArea);
                        }
                    }
                    finally {
                        env.constructs.set(slotName, slotDef);
                        RestoreEnv(saved);
                    }
                };
            }
        }
        finally {
            this.RestoreContext(saved);
        }
    }
    ParseSignature(elmSignat) {
        const signature = new Signature(elmSignat);
        for (const attr of elmSignat.attributes) {
            if (signature.RestParam)
                throw `Rest parameter must be the last`;
            const m = /^(#|@|\.\.\.|_|)(.*?)(\?)?$/.exec(attr.name);
            if (m[1] != '_') {
                const param = {
                    mode: m[1],
                    name: m[2],
                    pDefault: m[1] == '...' ? () => []
                        : attr.value != ''
                            ? (m[1] == '#' ? this.CompJScript(attr.value, attr.name) : this.CompString(attr.value, attr.name))
                            : m[3] ? /^on/.test(m[2]) ? _ => _ => null : DUndef
                                : null
                };
                signature.Params.push(param);
                if (m[1] == '...')
                    signature.RestParam = param;
            }
        }
        for (const elmSlot of elmSignat.children)
            signature.Slots.set(elmSlot.localName, this.ParseSignature(elmSlot));
        return signature;
    }
    CompComponent(srcParent, srcElm, atts) {
        const builders = [], bEncaps = CBool(atts.get('encapsulate')), styles = [], saveWS = this.wspc;
        let signature, elmTemplate;
        for (const srcChild of Array.from(srcElm.children)) {
            const childAtts = new Atts(srcChild);
            let builder;
            switch (srcChild.nodeName) {
                case 'SCRIPT':
                    builder = this.CompScript(srcElm, srcChild, childAtts);
                    break;
                case 'STYLE':
                    if (bEncaps)
                        styles.push(srcChild);
                    else
                        this.CompStyle(srcChild);
                    break;
                case 'TEMPLATE':
                    if (elmTemplate)
                        throw 'Double <TEMPLATE>';
                    elmTemplate = srcChild;
                    break;
                default:
                    if (signature)
                        throw `Illegal child element <${srcChild.nodeName}>`;
                    signature = this.ParseSignature(srcChild);
                    break;
            }
            if (builder)
                builders.push([builder, srcChild]);
        }
        if (!signature)
            throw `Missing signature`;
        if (!elmTemplate)
            throw 'Missing <TEMPLATE>';
        this.AddConstruct(signature);
        const templates = [
            this.CompTemplate(signature, elmTemplate.content, elmTemplate, false, bEncaps, styles)
        ];
        this.wspc = saveWS;
        return async function COMPONENT(area) {
            for (const [bldr, srcNode] of builders)
                await this.CallWithHandling(bldr, srcNode, area);
            const construct = { templates, constructEnv: undefined };
            DefConstruct(area.env, signature.name, construct);
            construct.constructEnv = CloneEnv(area.env);
        };
    }
    CompTemplate(signat, contentNode, srcElm, bNewNames, bEncaps, styles, atts) {
        const saved = this.SaveContext(), myAtts = atts || new Atts(srcElm), lvars = [];
        try {
            for (const { mode, name } of signat.Params)
                lvars.push([name, this.NewVar(myAtts.get(mode + name, bNewNames) || name)]);
            for (const S of signat.Slots.values())
                this.AddConstruct(S);
            if (!atts)
                myAtts.CheckNoAttsLeft();
            this.wspc = this.rspc = WSpc.block;
            const builder = this.CompChildNodes(contentNode), { name } = signat, customName = /^[A-Z].*-/.test(name) ? name : `rhtml-${name}`;
            return async function TEMPLATE(area, args, mSlotTemplates, slotEnv) {
                const saved = SaveEnv(), { env } = area;
                try {
                    for (const [slotName, instanceBuilders] of mSlotTemplates)
                        DefConstruct(env, slotName, { templates: instanceBuilders, constructEnv: slotEnv });
                    let i = 0;
                    for (const [name, lvar] of lvars) {
                        let arg = args[name], dflt;
                        if (arg === undefined && (dflt = signat.Params[i]?.pDefault))
                            arg = dflt(env);
                        lvar(env)(arg);
                        i++;
                    }
                    if (bEncaps) {
                        const { elmRange, childArea, bInit } = PrepareElement(srcElm, area, customName), elm = elmRange.node, shadow = elm.shadowRoot || elm.attachShadow({ mode: 'open' });
                        if (bInit)
                            for (const style of styles)
                                shadow.appendChild(style.cloneNode(true));
                        if (signat.RestParam)
                            ApplyModifier(elm, ModType.RestArgument, null, args[signat.RestParam.name], bInit);
                        childArea.parent = shadow;
                        area = childArea;
                    }
                    await builder.call(this, area);
                }
                finally {
                    RestoreEnv(saved);
                }
            };
        }
        catch (err) {
            throw `${OuterOpenTag(srcElm)} template: ${err}`;
        }
        finally {
            this.RestoreContext(saved);
        }
    }
    CompInstance(srcElm, atts, signature) {
        const { name, RestParam } = signature, contentSlot = signature.Slots.get('content'), getArgs = new Map(), slotBuilders = new Map();
        for (const name of signature.Slots.keys())
            slotBuilders.set(name, []);
        for (const { mode, name, pDefault } of signature.Params)
            if (mode == '@') {
                const attValue = atts.get(mode + name, !pDefault);
                if (attValue) {
                    const depValue = this.CompJScript(attValue, mode + name), setter = this.CompJScript(`ORx=>{${attValue}=ORx}`, name);
                    getArgs.set(name, env => this.RVAR('', depValue(env), null, setter(env)));
                }
                else
                    getArgs.set(name, env => this.RVAR('', pDefault(env)));
            }
            else if (mode != '...')
                getArgs.set(name, this.CompParameter(atts, name, pDefault));
        let slotElm, Slot;
        for (const node of Array.from(srcElm.childNodes))
            if (node.nodeType == Node.ELEMENT_NODE
                && (Slot = signature.Slots.get((slotElm = node).localName))
                && slotElm.localName != 'content') {
                slotBuilders.get(slotElm.localName).push(this.CompTemplate(Slot, slotElm, slotElm, true));
                srcElm.removeChild(node);
            }
        if (contentSlot)
            slotBuilders.get('content').push(this.CompTemplate(contentSlot, srcElm, srcElm, true, false, null, atts));
        if (RestParam) {
            const modifs = this.CompAttributes(atts);
            getArgs.set(RestParam.name, env => modifs.map(({ modType, name, depValue }) => ({ modType, name, value: depValue(env) })));
        }
        atts.CheckNoAttsLeft();
        this.wspc = WSpc.inline;
        return async function INSTANCE(area) {
            const { env } = area, cdef = env.constructs.get(name), { subArea } = PrepArea(srcElm, area);
            if (!cdef)
                return;
            bReadOnly = true;
            const args = {};
            for (const [nm, getArg] of getArgs)
                args[nm] = getArg(env);
            bReadOnly = false;
            subArea.env = cdef.constructEnv;
            for (const parBuilder of cdef.templates)
                await parBuilder.call(this, subArea, args, slotBuilders, env);
        };
    }
    CompHTMLElement(srcElm, atts) {
        const name = srcElm.localName.replace(/\.+$/, ''), preWs = this.wspc;
        let postWs;
        if (this.mPreformatted.has(name)) {
            this.wspc = WSpc.preserve;
            postWs = WSpc.block;
        }
        else if (RCompiler.regBlock.test(name)) {
            this.wspc = this.rspc = postWs = WSpc.block;
        }
        else if (RCompiler.regInline.test(name)) {
            postWs = WSpc.inline;
        }
        if (preWs == WSpc.preserve)
            postWs = WSpc.preserve;
        const modifs = this.CompAttributes(atts);
        const childnodesBuilder = this.CompChildNodes(srcElm);
        if (postWs)
            this.wspc = postWs;
        const builder = async function ELEMENT(area) {
            const { elmRange: { node }, childArea, bInit } = PrepareElement(srcElm, area, name);
            if (!area.bNoChildBuilding)
                await childnodesBuilder.call(this, childArea);
            node.removeAttribute('class');
            if (node.handlers) {
                for (const { evType, listener } of node.handlers)
                    node.removeEventListener(evType, listener);
            }
            node.handlers = [];
            ApplyModifiers(node, modifs, area.env, bInit);
        };
        builder.ws = (postWs == WSpc.block) || preWs < WSpc.preserve && childnodesBuilder.ws;
        return builder;
    }
    CompAttributes(atts) {
        const modifs = [];
        for (const [attName, attValue] of atts) {
            let m;
            try {
                if (m = /^on(.*)$/i.exec(attName))
                    modifs.push({
                        modType: ModType.Event,
                        name: CapitalProp(m[0]),
                        depValue: this.CompHandler(attName, attValue)
                    });
                else if (m = /^#class[:.](.*)$/.exec(attName))
                    modifs.push({
                        modType: ModType.Class, name: m[1],
                        depValue: this.CompJScript(attValue, attName)
                    });
                else if (m = /^#style\.(.*)$/.exec(attName))
                    modifs.push({
                        modType: ModType.Style, name: CapitalProp(m[1]),
                        depValue: this.CompJScript(attValue, attName)
                    });
                else if (m = /^style\.(.*)$/.exec(attName))
                    modifs.push({
                        modType: ModType.Style, name: CapitalProp(m[1]),
                        depValue: this.CompString(attValue, attName)
                    });
                else if (attName == '+style')
                    modifs.push({
                        modType: ModType.AddToStyle, name: null,
                        depValue: this.CompJScript(attValue, attName)
                    });
                else if (attName == "+class")
                    modifs.push({
                        modType: ModType.AddToClassList, name: null,
                        depValue: this.CompJScript(attValue, attName)
                    });
                else if (m = /^([\*\+#!]+|@@?)(.*)/.exec(attName)) {
                    const propName = CapitalProp(m[2]);
                    try {
                        const setter = m[1] == '#' ? null : this.CompJScript(`function(){const ORx=this.${propName};if(${attValue}!==ORx)${attValue}=ORx}`, attName);
                        if (/[@#]/.test(m[1]))
                            modifs.push({ modType: ModType.Prop, name: propName, depValue: this.CompJScript(attValue, attName) });
                        if (/\*/.test(m[1]))
                            modifs.push({ modType: ModType.oncreate, name: 'oncreate', depValue: setter });
                        if (/\+/.test(m[1]))
                            modifs.push({ modType: ModType.onupdate, name: 'onupdate', depValue: setter });
                        if (/[@!]/.test(m[1]))
                            modifs.push({ modType: ModType.Event,
                                name: /!!|@@/.test(m[1]) ? 'onchange' : 'oninput',
                                depValue: setter });
                    }
                    catch (err) {
                        throw `Invalid left-hand side '${attValue}'`;
                    }
                }
                else if (m = /^\.\.\.(.*)/.exec(attName)) {
                    if (attValue)
                        throw `Rest parameter cannot have a value`;
                    modifs.push({
                        modType: ModType.RestArgument, name: null,
                        depValue: this.CompName(m[1])
                    });
                }
                else if (attName == 'src')
                    modifs.push({
                        modType: ModType.Src,
                        name: this.FilePath,
                        depValue: this.CompString(attValue, attName),
                    });
                else
                    modifs.push({
                        modType: ModType.Attr,
                        name: attName,
                        depValue: this.CompString(attValue, attName)
                    });
            }
            catch (err) {
                throw (`[${attName}]: ${err}`);
            }
        }
        atts.clear();
        return modifs;
    }
    CompStyle(srcStyle) {
        this.head.appendChild(srcStyle);
        this.AddedHeaderElements.push(srcStyle);
    }
    CompString(data, name) {
        const regIS = this.regIS ||=
            new RegExp(/(?<![\\$])/.source
                + (this.Settings.bDollarRequired ? '\\$' : '\\$?')
                + /\{((\{(\{.*?\}|.)*?\}|'.*?'|".*?"|`.*?`|.)*?)(?<!\\)\}|$/.source, 'gs'), generators = [], ws = name || this.Settings.bKeepWhiteSpace ? WSpc.preserve : this.wspc;
        let isTrivial = true, bThis = false;
        regIS.lastIndex = 0;
        while (regIS.lastIndex < data.length) {
            const lastIndex = regIS.lastIndex, m = regIS.exec(data);
            let fixed = lastIndex < m.index ? data.substring(lastIndex, m.index) : null;
            if (fixed) {
                fixed = fixed.replace(/\\([${}\\])/g, '$1');
                if (ws < WSpc.preserve) {
                    fixed = fixed.replace(/\s+/g, ' ');
                    if (ws <= WSpc.inlineSpc && !generators.length)
                        fixed = fixed.replace(/^ /, '');
                    if (this.rspc && !m[1] && regIS.lastIndex == data.length)
                        fixed = fixed.replace(/ $/, '');
                }
                if (fixed)
                    generators.push(fixed);
            }
            if (m[1]) {
                const getS = this.CompJScript(m[1], name, '{}');
                generators.push(getS);
                isTrivial = false;
                bThis ||= getS.bThis;
            }
        }
        let dep;
        if (isTrivial) {
            const result = generators.join('');
            dep = () => result;
            dep.fixed = result;
        }
        else
            dep = bThis ?
                function (env) {
                    try {
                        let result = "";
                        for (const gen of generators)
                            result += typeof gen == 'string' ? gen : gen.call(this, env) ?? '';
                        return result;
                    }
                    catch (err) {
                        throw name ? `[${name}]: ${err}` : err;
                    }
                }
                : (env) => {
                    try {
                        let result = "";
                        for (const gen of generators)
                            result += typeof gen == 'string' ? gen : gen(env) ?? '';
                        return result;
                    }
                    catch (err) {
                        throw name ? `[${name}]: ${err}` : err;
                    }
                };
        dep.bThis = bThis;
        return dep;
    }
    CompPattern(patt, url) {
        let reg = '', lvars = [];
        const regIS = /(?<![\\$])\$?\{(.*?)(?<!\\)\}|\?|\*|(\\.)|\[\^?(?:\\.|[^\\\]])*\]|$/gs;
        while (regIS.lastIndex < patt.length) {
            const lastIndex = regIS.lastIndex;
            const m = regIS.exec(patt);
            const literals = patt.substring(lastIndex, m.index);
            if (literals)
                reg += quoteReg(literals);
            if (m[1]) {
                reg += `(.*?)`;
                lvars.push(this.NewVar(m[1]));
            }
            else if (m[0] == '?')
                reg += '.';
            else if (m[0] == '*')
                reg += '.*';
            else if (m[2])
                reg += m[2];
            else
                reg += m[0];
        }
        return { lvars, regex: new RegExp(`^${reg}$`, 'i'), url };
    }
    CompParameter(atts, attName, pDefault) {
        const value = atts.get(attName);
        return (value == null ? this.CompAttrExpr(atts, attName, !pDefault) || pDefault
            : /^on/.test(attName) ? this.CompHandler(attName, value)
                : this.CompString(value, attName));
    }
    CompAttrExpr(atts, attName, bRequired) {
        return this.CompJScript(atts.get(attName, bRequired, true), attName);
    }
    CompHandler(name, text) {
        return this.CompJScript(`function(event){${text}\n}`, name);
    }
    CompJScript(expr, descript, delims = '""') {
        if (expr == null)
            return null;
        const bThis = /\bthis\b/.test(expr), depExpr = bThis ?
            `'use strict';(function expr([${this.context}]){return (${expr}\n)})`
            : `'use strict';([${this.context}])=>(${expr}\n)`, errorInfo = `${descript ? `[${descript}] ` : ''}${delims[0]}${Abbreviate(expr, 60)}${delims[1]}: `;
        try {
            const routine = gEval(depExpr), depValue = (bThis
                ? function (env) {
                    try {
                        return routine.call(this, env);
                    }
                    catch (err) {
                        throw errorInfo + err;
                    }
                }
                : (env) => {
                    try {
                        return routine(env);
                    }
                    catch (err) {
                        throw errorInfo + err;
                    }
                });
            depValue.bThis = bThis;
            return depValue;
        }
        catch (err) {
            throw errorInfo + err;
        }
    }
    CompName(name) {
        const i = this.ContextMap.get(name);
        if (i === undefined)
            throw `Unknown name '${name}'`;
        return env => env[i];
    }
    compAttrExprList(atts, attName, bReacts) {
        const list = atts.get(attName, false, true);
        if (!list)
            return null;
        if (bReacts)
            for (const nm of list.split(','))
                this.cRvars.set(nm.trim(), false);
        return list ? this.CompJScript(`[${list}\n]`, attName) : null;
    }
    GetURL(src) {
        return new URL(src, this.FilePath).href;
    }
    GetPath(src) {
        return this.GetURL(src).replace(/[^/]*$/, '');
    }
    async FetchText(src) {
        return await (await RFetch(this.GetURL(src))).text();
    }
}
RCompiler.iNum = 0;
RCompiler.genAtts = /^((this)?reacts?on|on((create|\*)|(update|\+))+)$/;
RCompiler.regBlock = /^(body|blockquote|d[dlt]|div|form|h\d|hr|li|ol|p|table|t[rhd]|ul|select)$/;
RCompiler.regInline = /^(input|img)$/;
const gFetch = fetch;
export async function RFetch(input, init) {
    const r = await gFetch(input, init);
    if (!r.ok)
        throw `${init?.method || 'GET'} ${input} returned ${r.status} ${r.statusText}`;
    return r;
}
globalThis.RFetch = RFetch;
function quoteReg(fixed) {
    return fixed.replace(/[.()?*+^$\\]/g, s => `\\${s}`);
}
class _RVAR {
    constructor(MainC, globalName, initialValue, store, storeName) {
        this.MainC = MainC;
        this.store = store;
        this.storeName = storeName;
        this._Subscribers = new Set();
        if (globalName)
            globalThis[globalName] = this;
        this.storeName ||= globalName;
        let s;
        if ((s = store && store.getItem(`RVAR_${this.storeName}`)) != null)
            try {
                this._Value = JSON.parse(s);
                return;
            }
            catch { }
        this.SetAsync(initialValue);
    }
    Subscribe(s, bImmediate, bInit = bImmediate) {
        if (bInit)
            s();
        s.bImm = bImmediate;
        if (!s.ref)
            s.ref = { isConnected: true };
        this._Subscribers.add(s);
    }
    Unsubscribe(s) {
        this._Subscribers.delete(s);
    }
    get V() { return this._Value; }
    set V(t) {
        if (t !== this._Value) {
            this._Value = t;
            this.SetDirty();
        }
    }
    get Set() {
        return this.SetAsync.bind(this);
    }
    SetAsync(t) {
        if (t instanceof Promise) {
            this.V = undefined;
            t.then(v => { this.V = v; });
        }
        else
            this.V = t;
    }
    get U() {
        if (!bReadOnly)
            this.SetDirty();
        return this._Value;
    }
    set U(t) { this._Value = t; this.SetDirty(); }
    SetDirty() {
        if (this.store)
            this.MainC.DirtyVars.add(this);
        let b;
        for (const sub of this._Subscribers)
            if (sub.bImm)
                sub(this._Value);
            else if (sub.ref.isConnected) {
                this.MainC.AddDirty(sub);
                b = true;
            }
            else
                this._Subscribers.delete(sub);
        if (b)
            this.MainC.RUpdate();
    }
    Save() {
        this.store.setItem(`RVAR_${this.storeName}`, JSON.stringify(this._Value));
    }
}
class Atts extends Map {
    constructor(elm) {
        super();
        for (const att of elm.attributes)
            if (!/^_/.test(att.name))
                super.set(att.name, att.value);
    }
    get(name, bRequired, bHashAllowed) {
        let n = name, value = super.get(n);
        if (value == null && bHashAllowed) {
            n = `#${name}`;
            value = super.get(n);
        }
        if (value != null)
            super.delete(n);
        else if (bRequired)
            throw `Missing attribute [${name}]`;
        return value;
    }
    CheckNoAttsLeft() {
        if (super.size)
            throw `Unknown attribute${super.size > 1 ? 's' : ''}: ${Array.from(super.keys()).join(',')}`;
    }
}
const regIdentifier = /^[A-Za-z_$][A-Za-z0-9_$]*$/, regReserved = /^(?:break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|finally|for|function|if|import|in|instanceof|new|return|super|switch|this|throw|try|typeof|var|void|while|with|yield|enum|implements|interface|let|package|private|protected|public|static|yield|null|true|false)$/;
function CheckValidIdentifier(name) {
    name = name.trim();
    if (!regIdentifier.test(name))
        throw `Invalid identifier '${name}'`;
    if (regReserved.test(name))
        throw `Reserved keyword '${name}'`;
    return name;
}
const words = '(?:align|animation|aria|auto|background|blend|border|bottom|bounding|break|caption|caret|child|class|client'
    + '|clip|(?:col|row)(?=span)|column|content|element|feature|fill|first|font|get|grid|image|inner|^is|last|left|line|margin|^max|^min|node|offset|outer'
    + '|outline|overflow|owner|padding|parent|read|right|size|rule|scroll|selected|table|tab(?=index)|text|top|value|variant)';
const regCapitalize = new RegExp(`html|uri|(?<=${words})[a-z]`, "g");
function CapitalProp(lcName) {
    return lcName.replace(regCapitalize, (char) => char.toUpperCase());
}
function OuterOpenTag(elm, maxLength) {
    return Abbreviate(/<.*?(?=>)/s.exec(elm.outerHTML)[0], maxLength - 1) + '>';
}
function Abbreviate(s, maxLength) {
    return (maxLength && s.length > maxLength
        ? s.substr(0, maxLength - 3) + "..."
        : s);
}
function CBool(s, valOnEmpty = true) {
    if (typeof s == 'string')
        switch (s.toLowerCase()) {
            case "yes":
            case "true":
                return true;
            case "no":
            case "false":
                return false;
            case "":
                return valOnEmpty;
            default:
                return null;
        }
    return s;
}
function* concIterable(R, S) {
    for (const x of R)
        yield x;
    for (const x of S)
        yield x;
}
function createErrorNode(message) {
    const node = document.createElement('div');
    node.style.color = 'crimson';
    node.style.fontFamily = 'sans-serif';
    node.style.fontSize = '10pt';
    node.innerText = message;
    return node;
}
function copyStyleSheets(S, D) {
    for (const SSheet of S.styleSheets) {
        const DSheet = D.head.appendChild(D.createElement('style')).sheet;
        for (const rule of SSheet.cssRules)
            DSheet.insertRule(rule.cssText);
    }
}
export let R = new RCompiler();
Object.defineProperties(globalThis, {
    RVAR: { get: () => R.RVAR.bind(R) },
    RUpdate: { get: () => R.RUpdate.bind(R) },
});
globalThis.RCompile = RCompile;
globalThis.RBuild = RBuild;
export const RVAR = globalThis.RVAR, RUpdate = globalThis.RUpdate;
const _range = globalThis.range = function* range(from, upto, step = 1) {
    if (upto === undefined) {
        upto = from;
        from = 0;
    }
    for (let i = from; i < upto; i += step)
        yield i;
};
export { _range as range };
export const docLocation = RVAR('docLocation', location.href);
Object.defineProperty(docLocation, 'subpath', { get: () => location.pathname.substr(RootPath.length) });
window.addEventListener('popstate', () => { docLocation.V = location.href; });
function ScrollToHash() {
    if (location.hash)
        setTimeout((() => document.getElementById(location.hash.substr(1))?.scrollIntoView()), 6);
}
docLocation.Subscribe(() => {
    if (docLocation.V != location.href)
        history.pushState(null, null, docLocation.V);
    docLocation.searchParams = new URLSearchParams(location.search);
    ScrollToHash();
    ;
}, true);
export const reroute = globalThis.reroute =
    (arg) => {
        if (typeof arg == 'string')
            docLocation.V = arg;
        else if (!arg.ctrlKey) {
            docLocation.V = arg.target.href;
            arg.preventDefault();
        }
    };
