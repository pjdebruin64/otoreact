var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
const defaultSettings = {
    bTiming: false,
    bAbortOnError: false,
    bShowErrors: true,
    bRunScripts: false,
    bBuild: true,
    basePattern: '/',
    preformatted: [],
    bNoGlobals: false,
    bDollarRequired: false,
    bSetPointer: true,
    bKeepWhiteSpace: false,
    bKeepComments: false,
}, parser = new DOMParser();
var WSpc;
(function (WSpc) {
    WSpc[WSpc["block"] = 1] = "block";
    WSpc[WSpc["inlineSpc"] = 2] = "inlineSpc";
    WSpc[WSpc["inline"] = 3] = "inline";
    WSpc[WSpc["preserve"] = 4] = "preserve";
})(WSpc || (WSpc = {}));
class Range {
    constructor(node, area, text) {
        var _a;
        this.node = node;
        this.text = text;
        this.next = null;
        if (!node)
            this.child = null;
        if (area && !((_a = area.parentR) === null || _a === void 0 ? void 0 : _a.node))
            this.parentR = area.parentR;
    }
    toString() { var _a; return this.text || ((_a = this.node) === null || _a === void 0 ? void 0 : _a.nodeName); }
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
        return null;
    }
    get Next() {
        let r = this, n, p;
        do {
            p = r.parentR;
            while (r = r.next)
                if (n = r.First)
                    return n;
        } while (r = p);
        return null;
    }
    get FirstOrNext() {
        return this.First || this.Next;
    }
    Nodes() {
        return (function* Nodes(r) {
            if (r.node)
                yield r.node;
            else {
                let { child } = r;
                while (child) {
                    yield* Nodes(child);
                    child = child.next;
                }
            }
        })(this);
    }
    erase(parent) {
        if (this.node)
            parent.removeChild(this.node);
        else {
            let { child } = this;
            this.child = null;
            while (child) {
                child.erase(parent);
                child.erased = true;
                child.parentR = null;
                child = child.next;
            }
        }
    }
}
const DUndef = () => undefined;
function PrepArea(srcElm, area, text = '', nWipe, result) {
    let { parent, range } = area, subArea = { parent, range: null }, bInit = !range;
    if (bInit) {
        subArea.source = area.source;
        subArea.before = area.before;
        if (srcElm)
            text = `${srcElm.localName}${text ? ' ' : ''}${text}`;
        UpdatePrevRange(area, range = subArea.parentR = new Range(null, area, text));
        range.result = result;
    }
    else {
        subArea.range = range.child;
        area.range = range.next;
        if (nWipe && (nWipe == 2 || result != range.result)) {
            range.result = result;
            range.erase(parent);
            range.child = null;
            subArea.range = null;
            subArea.before = range.Next;
            subArea.parentR = range;
            bInit = true;
        }
    }
    return { range, subArea, bInit };
}
function UpdatePrevRange(area, range) {
    let r;
    if (r = area.prevR)
        r.next = range;
    else if (r = area.parentR)
        r.child = range;
    area.prevR = range;
}
function PrepareElement(srcElm, area, nodeName = srcElm.nodeName) {
    let range = area.range, bInit = !range;
    if (bInit) {
        const elm = (area.source == srcElm
            ? (srcElm.innerHTML = "", srcElm)
            : area.parent.insertBefore(document.createElement(nodeName), area.before));
        range = new Range(elm, area);
        UpdatePrevRange(area, range);
    }
    else {
        area.range = range.next;
    }
    return {
        range,
        childArea: {
            parent: range.node,
            range: range.child,
            before: null,
            parentR: range
        },
        bInit
    };
}
function PrepCharData(area, content, bComm) {
    let range = area.range;
    if (!range) {
        range = new Range(area.parent.insertBefore(bComm ? document.createComment(content) : document.createTextNode(content), area.before), area);
        UpdatePrevRange(area, range);
    }
    else {
        range.node.data = content;
        area.range = range.next;
    }
}
let BasePath = null;
let ToBuild = [];
export function RCompile(elm, settings) {
    try {
        const { basePattern } = R.Settings = Object.assign(Object.assign({}, defaultSettings), settings), m = location.href.match(`^.*(${basePattern})`);
        R.FilePath = location.origin + (globalThis.BasePath = globalThis.BasePath = BasePath = m ? (new URL(m[0])).pathname.replace(/[^/]*$/, '') : '');
        R.RootElm = elm;
        R.Compile(elm, {}, true);
        ToBuild.push({ parent: elm.parentElement, source: elm, range: null });
        return (R.Settings.bBuild
            ? RBuild()
            : null);
    }
    catch (err) {
        window.alert(`OtoReact error: ${err}`);
    }
}
export function RBuild() {
    return __awaiter(this, void 0, void 0, function* () {
        R.start = performance.now();
        builtNodeCount = 0;
        try {
            for (const area of ToBuild)
                yield R.InitialBuild(area);
            R.logTime(`${R.num}: Built ${builtNodeCount} nodes in ${(performance.now() - R.start).toFixed(1)} ms`);
            ScrollToHash();
        }
        catch (err) {
            window.alert(`OtoReact error: ${err}`);
        }
        ToBuild = [];
    });
}
function NewEnv() {
    const env = [];
    env.constructs = new Map();
    return env;
}
function CloneEnv(env) {
    const clone = Object.assign(new Array(), env);
    clone.constructs = new Map(env.constructs.entries());
    return clone;
}
function assignEnv(target, source) {
    const C = target.constructs;
    Object.assign(target, source);
    target.constructs = C;
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
        var _a;
        if (!sig)
            return false;
        let result = true;
        const mapSigParams = new Map(sig.Params.map(p => [p.name, p.pDefault]));
        for (const { name, pDefault } of this.Params)
            if (mapSigParams.has(name)) {
                result && (result = !pDefault || mapSigParams.get(name));
                mapSigParams.delete(name);
            }
            else
                result = false;
        for (const pDefault of mapSigParams.values())
            result && (result = pDefault);
        for (let [slotname, slotSig] of this.Slots)
            result && (result = (_a = sig.Slots.get(slotname)) === null || _a === void 0 ? void 0 : _a.IsCompatible(slotSig));
        return !!result;
    }
}
const gEval = eval;
var MType;
(function (MType) {
    MType[MType["Attr"] = 0] = "Attr";
    MType[MType["Prop"] = 1] = "Prop";
    MType[MType["Src"] = 2] = "Src";
    MType[MType["Class"] = 3] = "Class";
    MType[MType["Style"] = 4] = "Style";
    MType[MType["Event"] = 5] = "Event";
    MType[MType["AddToStyle"] = 6] = "AddToStyle";
    MType[MType["AddToClassList"] = 7] = "AddToClassList";
    MType[MType["RestArgument"] = 8] = "RestArgument";
    MType[MType["oncreate"] = 9] = "oncreate";
    MType[MType["onupdate"] = 10] = "onupdate";
})(MType || (MType = {}));
let bReadOnly = false;
function ApplyModifier(elm, modType, nm, val, bCreate) {
    switch (modType) {
        case MType.Attr:
            elm.setAttribute(nm, val);
            break;
        case MType.Src:
            elm.setAttribute('src', new URL(val, nm).href);
            break;
        case MType.Prop:
            if (val === undefined && typeof elm[nm] == 'string')
                val = '';
            if (val !== elm[nm])
                elm[nm] = val;
            break;
        case MType.Event:
            let m;
            if (val)
                if (m = /^on(input|change)$/.exec(nm)) {
                    elm.addEventListener(m[1], val);
                    elm.handlers.push({ evType: m[1], listener: val });
                }
                else {
                    elm[nm] = val;
                    if (/^onclick$/.test(nm) && R.Settings.bSetPointer)
                        elm.style.cursor = val && !elm.disabled ? 'pointer' : null;
                }
            break;
        case MType.Class:
            if (val)
                elm.classList.add(nm);
            break;
        case MType.Style:
            elm.style[nm] = val || (val === 0 ? '0' : null);
            break;
        case MType.AddToStyle:
            if (val)
                for (const [name, v] of Object.entries(val))
                    elm.style[name] = v || (v === 0 ? '0' : null);
            break;
        case MType.AddToClassList:
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
        case MType.RestArgument:
            for (const { modType, name, value } of val || [])
                ApplyModifier(elm, modType, name, value, bCreate);
            break;
        case MType.oncreate:
            if (bCreate)
                val.call(elm);
        case MType.onupdate:
            if (!bCreate)
                val.call(elm);
            break;
    }
}
function ApplyModifiers(elm, modifiers, bCreate) {
    bReadOnly = true;
    for (const { mType: modType, name, depV: depValue } of modifiers)
        try {
            const value = depValue.bThis ? depValue.call(elm) : depValue();
            ApplyModifier(elm, modType, name, value, bCreate);
        }
        catch (err) {
            throw `[${name}]: ${err}`;
        }
    bReadOnly = false;
}
const RModules = new Map();
let env, onerror, onsuccess, builtNodeCount = 0;
const envActions = [];
function SaveEnv() {
    return envActions.length;
}
function RestoreEnv(savedEnv) {
    for (let j = envActions.length; j > savedEnv; j--)
        envActions.pop()();
}
function DefConstruct(name, construct) {
    const { constructs } = env, prevDef = constructs.get(name);
    constructs.set(name, construct);
    envActions.push(() => mapSet(constructs, name, prevDef));
}
let updCnt = 0;
class RCompiler {
    constructor(RC) {
        this.RC = RC;
        this.num = RCompiler.iNum++;
        this.cRvars = new Map();
        this.restoreActions = [];
        this.mPreformatted = new Set(['pre']);
        this.AllAreas = [];
        this.bCompiled = false;
        this.wspc = WSpc.block;
        this.rspc = 1;
        this.DirtyVars = new Set();
        this.DirtySubs = new Map();
        this.bUpdating = false;
        this.bUpdate = false;
        this.handleUpdate = null;
        this.sourceNodeCount = 0;
        this.context = (RC === null || RC === void 0 ? void 0 : RC.context) || "";
        this.ContextMap = RC ? new Map(RC.ContextMap) : new Map();
        this.CSignatures = RC ? new Map(RC.CSignatures) : new Map();
        this.Settings = RC ? Object.assign({}, RC.Settings) : Object.assign({}, defaultSettings);
        this.AddedHeaderElements = (RC === null || RC === void 0 ? void 0 : RC.AddedHeaderElements) || [];
        this.head = (RC === null || RC === void 0 ? void 0 : RC.head) || document.head;
        this.StyleBefore = RC === null || RC === void 0 ? void 0 : RC.StyleBefore;
        this.FilePath = (RC === null || RC === void 0 ? void 0 : RC.FilePath) || location.origin + BasePath;
        this.RC || (this.RC = this);
    }
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
            init = (() => (_) => { });
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
                init = (() => {
                    envActions.push(() => { env.length = i; });
                    return (value) => { env[i] = value; };
                });
            }
            else
                init = (() => {
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
        this.restoreActions.push(() => mapSet(this.CSignatures, Cnm, savedConstr));
    }
    Compile(elm, settings = {}, bIncludeSelf = false) {
        const t0 = performance.now();
        Object.assign(this.Settings, settings);
        for (const tag of this.Settings.preformatted)
            this.mPreformatted.add(tag.toLowerCase());
        const savedR = R;
        try {
            R = this;
            this.Builder =
                bIncludeSelf
                    ? this.CompElm(elm.parentElement, elm, true)[0]
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
    Subscriber({ parent, bNoChildBuilding }, builder, range, ...args) {
        if (range)
            range.updated = updCnt;
        const sArea = {
            parent, bNoChildBuilding,
            range,
        }, subEnv = { env: CloneEnv(env), onerror, onsuccess }, subscriber = () => __awaiter(this, void 0, void 0, function* () {
            var _a;
            const { range } = sArea, save = { env, onerror, onsuccess };
            if (!range.erased && ((_a = range.updated) !== null && _a !== void 0 ? _a : 0) < updCnt) {
                range.updated = updCnt;
                ;
                ({ env, onerror, onsuccess } = subEnv);
                builtNodeCount++;
                try {
                    yield builder.call(this, Object.assign({}, sArea), ...args);
                }
                finally {
                    ({ env, onerror, onsuccess } = save);
                }
            }
        });
        subscriber.sArea = sArea;
        subscriber.ref = range;
        subscriber.env = subEnv.env;
        return subscriber;
    }
    InitialBuild(area) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const saveR = R, { parentR } = area;
            R = this;
            env = NewEnv();
            builtNodeCount++;
            yield this.Builder(area);
            const subs = this.Subscriber(area, this.Builder, (_a = parentR === null || parentR === void 0 ? void 0 : parentR.child) !== null && _a !== void 0 ? _a : area.prevR);
            this.AllAreas.push(subs);
            R = saveR;
        });
    }
    AddDirty(sub) {
        this.DirtySubs.set(sub.ref, sub);
    }
    RUpdate() {
        this.bUpdate = true;
        if (!this.bUpdating && !this.handleUpdate)
            this.handleUpdate = setTimeout(() => {
                this.handleUpdate = null;
                this.DoUpdate();
            }, 5);
    }
    DoUpdate() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.bCompiled || this.bUpdating) {
                this.bUpdate = true;
                return;
            }
            updCnt++;
            do {
                this.bUpdate = false;
                this.bUpdating = true;
                let saveR = R;
                try {
                    for (const rvar of this.DirtyVars)
                        rvar.Save();
                    this.DirtyVars.clear();
                    if (this.DirtySubs.size) {
                        R = this;
                        this.start = performance.now();
                        builtNodeCount = 0;
                        const subs = this.DirtySubs;
                        this.DirtySubs = new Map();
                        for (const sub of subs.values())
                            try {
                                yield sub();
                            }
                            catch (err) {
                                const msg = `ERROR: ${err}`;
                                console.log(msg);
                                window.alert(msg);
                            }
                        this.logTime(`${R.num}: Updated ${builtNodeCount} nodes in ${(performance.now() - this.start).toFixed(1)} ms`);
                    }
                }
                finally {
                    R = saveR;
                    this.bUpdating = false;
                }
            } while (this.bUpdate);
        });
    }
    RVAR(name, value, store, subs, storeName) {
        const r = new _RVAR(this.RC, name, value, store, storeName);
        if (subs)
            r.Subscribe(subs, true, false);
        return r;
    }
    RVAR_Light(t, updatesTo) {
        if (!t._Subscribers) {
            t._Subscribers = new Set();
            t._UpdatesTo = updatesTo;
            const { RC } = this;
            Object.defineProperty(t, 'U', { get: () => {
                    var _a;
                    if (!bReadOnly) {
                        for (const sub of t._Subscribers)
                            RC.AddDirty(sub);
                        if ((_a = t._UpdatesTo) === null || _a === void 0 ? void 0 : _a.length)
                            for (const rvar of t._UpdatesTo)
                                rvar.SetDirty();
                        else
                            RC.RUpdate();
                    }
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
                function ChildNodes(area) {
                    return __awaiter(this, void 0, void 0, function* () {
                        const savedEnv = SaveEnv();
                        try {
                            yield builder.call(this, area);
                        }
                        finally {
                            RestoreEnv(savedEnv);
                        }
                    });
                }
                : () => __awaiter(this, void 0, void 0, function* () { });
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
                    builder = this.CompElm(srcParent, srcNode);
                    break;
                case Node.TEXT_NODE:
                    this.sourceNodeCount++;
                    let str = srcNode.nodeValue;
                    const getText = this.CompString(str), { fixed } = getText;
                    if (fixed !== '') {
                        builder =
                            [fixed
                                    ? (area) => __awaiter(this, void 0, void 0, function* () { return PrepCharData(area, fixed); })
                                    : (area) => __awaiter(this, void 0, void 0, function* () { return PrepCharData(area, getText()); }), srcNode,
                                fixed == ' '];
                        if (this.wspc < WSpc.preserve)
                            this.wspc = /\s$/.test(str) ? WSpc.inlineSpc : WSpc.inline;
                    }
                    break;
                case Node.COMMENT_NODE:
                    if (this.Settings.bKeepComments) {
                        const getText = this.CompString(srcNode.nodeValue, 'Comment');
                        builder =
                            [(area) => __awaiter(this, void 0, void 0, function* () { return PrepCharData(area, getText(), true); }), srcNode, 1];
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
        const Iter = function Iter(area, start = 0) {
            return __awaiter(this, void 0, void 0, function* () {
                let i = 0;
                if (!area.range) {
                    const toSubscribe = [];
                    for (const [builder] of builders) {
                        i++;
                        yield builder.call(this, area);
                        if (builder.auto)
                            toSubscribe.push(this.Subscriber(area, Iter, area.prevR, i));
                    }
                    for (const subs of toSubscribe) {
                        const { sArea } = subs, { range } = sArea, rvar = range.value;
                        if (!rvar._Subscribers.size && range.next) {
                            (sArea.range = range.next).updated = 0;
                            subs.ref = {};
                            rvar.Subscribe(rvar.auto = subs);
                        }
                    }
                }
                else
                    for (const [builder] of builders)
                        if (i++ >= start) {
                            const r = area.range;
                            yield builder.call(this, area);
                            if (builder.auto && r.value.auto)
                                assignEnv(r.value.auto.env, env);
                        }
                builtNodeCount += builders.length - start;
            });
        };
        Iter.ws = builders[0][0].ws;
        return Iter;
    }
    CompElm(srcParent, srcElm, bUnhide) {
        var _a, _b;
        const atts = new Atts(srcElm), reacts = [], genMods = [];
        let depOnerror, depOnsuccess;
        if (bUnhide)
            atts.set('#hidden', 'false');
        let builder, elmBuilder, isBlank;
        try {
            let m;
            for (const attName of atts.keys())
                if (m = RCompiler.genAtts.exec(attName))
                    if (m[1])
                        reacts.push({ attName, rvars: this.compAttrExprList(atts, attName, true) });
                    else if (m[2])
                        genMods.push({ attName,
                            bCr: /create|\*/.test(attName),
                            bUpd: /update|\+/.test(attName),
                            text: atts.get(attName) });
                    else {
                        const dep = this.CompHandler(attName, atts.get(attName));
                        if (m[3]) {
                            depOnerror = dep;
                            depOnerror.bBldr = !/-$/.test(attName);
                        }
                        else
                            depOnsuccess = dep;
                    }
            const construct = this.CSignatures.get(srcElm.localName);
            if (construct)
                builder = this.CompInstance(srcElm, atts, construct);
            else {
                switch (srcElm.localName) {
                    case 'def':
                    case 'define':
                        {
                            for (let C of srcElm.childNodes)
                                if (C.nodeType != Node.TEXT_NODE || !/^\s*$/.test(C.data))
                                    throw `<${srcElm.localName} ...> must be followed by </${srcElm.localName}>`;
                            const rvarName = atts.get('rvar'), varName = rvarName || atts.get('let') || atts.get('var', true), getValue = this.CompParameter(atts, 'value', DUndef), getStore = rvarName && this.CompAttrExpr(atts, 'store'), bReact = CBool((_a = atts.get('reacting')) !== null && _a !== void 0 ? _a : atts.get('updating')), newVar = this.NewVar(varName);
                            if (rvarName) {
                                const a = this.cRvars.get(rvarName);
                                this.cRvars.set(rvarName, true);
                                this.restoreActions.push(() => {
                                    if (elmBuilder)
                                        elmBuilder.auto = this.cRvars.get(rvarName);
                                    this.cRvars.set(rvarName, a);
                                });
                            }
                            builder = function DEF(area) {
                                return __awaiter(this, void 0, void 0, function* () {
                                    const { range, bInit } = PrepArea(srcElm, area);
                                    if (bInit || bReact) {
                                        const value = getValue();
                                        if (rvarName)
                                            if (bInit)
                                                range.value = new _RVAR(this.RC, null, value, getStore && getStore(), `RVAR_${rvarName}`);
                                            else
                                                range.value.SetAsync(value);
                                        else
                                            range.value = value;
                                    }
                                    newVar()(range.value);
                                });
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
                                                            ? { regex: new RegExp(pattern, 'i'), lvars: (((_b = atts.get('captures')) === null || _b === void 0 ? void 0 : _b.split(',')) || []).map(this.NewVar.bind(this))
                                                            }
                                                            : null;
                                            if (bHiding && (patt === null || patt === void 0 ? void 0 : patt.lvars.length))
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
                                function CASE(area) {
                                    return __awaiter(this, void 0, void 0, function* () {
                                        const value = getVal && getVal();
                                        let choosenAlt = null;
                                        let matchResult;
                                        for (const alt of caseList)
                                            try {
                                                if (!((!alt.cond || alt.cond())
                                                    && (!alt.patt || (matchResult = alt.patt.regex.exec(value)))) == alt.not) {
                                                    choosenAlt = alt;
                                                    break;
                                                }
                                            }
                                            catch (err) {
                                                if (bHiding)
                                                    for (const alt of caseList)
                                                        PrepareElement(alt.node, area);
                                                else
                                                    PrepArea(srcElm, area, '', 1, choosenAlt);
                                                throw (alt.node.nodeName == 'IF' ? '' : OuterOpenTag(alt.node)) + err;
                                            }
                                        if (bHiding) {
                                            for (const alt of caseList) {
                                                const { range, childArea, bInit } = PrepareElement(alt.node, area);
                                                const bHidden = range.node.hidden = alt != choosenAlt;
                                                if ((!bHidden || bInit) && !area.bNoChildBuilding)
                                                    yield this.CallWithHandling(alt.builder, alt.node, childArea);
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
                                                            lvar()((choosenAlt.patt.url ? decodeURIComponent : (r) => r)(matchResult[i++]));
                                                    }
                                                    yield this.CallWithHandling(choosenAlt.builder, choosenAlt.node, subArea);
                                                }
                                                finally {
                                                    RestoreEnv(saved);
                                                }
                                            }
                                        }
                                    });
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
                            const task = (() => __awaiter(this, void 0, void 0, function* () {
                                const textContent = yield this.FetchText(src);
                                const parser = new DOMParser();
                                const parsedContent = parser.parseFromString(textContent, 'text/html');
                                C.Compile(parsedContent.body, { bRunScripts: true }, false);
                            }))();
                            builder =
                                function INCLUDE(area) {
                                    return __awaiter(this, void 0, void 0, function* () {
                                        const t0 = performance.now();
                                        yield task;
                                        this.start += performance.now() - t0;
                                        yield C.Builder(area);
                                    });
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
                            const C = new RCompiler(this);
                            C.FilePath = this.GetPath(src);
                            C.Settings.bRunScripts = true;
                            let promiseModule = RModules.get(src);
                            if (!promiseModule) {
                                promiseModule = this.FetchText(src)
                                    .then(textContent => {
                                    const parsedDoc = parser.parseFromString(textContent, 'text/html'), builder = C.CompIterator(null, concIterable(parsedDoc.head.children, parsedDoc.body.children));
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
                            builder = function IMPORT() {
                                return __awaiter(this, void 0, void 0, function* () {
                                    const saveEnv = env, builder = yield promiseModule;
                                    env = NewEnv();
                                    yield builder.call(C, { parent: document.createDocumentFragment(), start: null, bInit: true });
                                    const { constructs } = env;
                                    env = saveEnv;
                                    for (const { name } of listImports)
                                        DefConstruct(name, constructs.get(name));
                                });
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
                                builder = function HASH(area) {
                                    return __awaiter(this, void 0, void 0, function* () {
                                        const { subArea, range } = PrepArea(srcElm, area, 'hash');
                                        const hashes = getHashes();
                                        if (!range.value || hashes.some((hash, i) => hash !== range.value[i])) {
                                            range.value = hashes;
                                            yield b.call(this, subArea);
                                        }
                                    });
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
                            builder = function RHTML(area) {
                                return __awaiter(this, void 0, void 0, function* () {
                                    const srctext = getSrctext();
                                    const { range, bInit } = PrepareElement(srcElm, area, 'rhtml-rhtml'), { node } = range;
                                    ApplyModifiers(node, modifs, bInit);
                                    if (area.prevR || srctext != range.result) {
                                        range.result = srctext;
                                        const shadowRoot = node.shadowRoot || node.attachShadow({ mode: 'open' }), tempElm = document.createElement('rhtml'), savedEnv = env;
                                        try {
                                            tempElm.innerHTML = srctext;
                                            if (range.hdrElms) {
                                                for (const elm of range.hdrElms)
                                                    elm.remove();
                                                range.hdrElms = null;
                                            }
                                            const R = new RCompiler();
                                            ;
                                            (R.head = shadowRoot).innerHTML = '';
                                            R.Compile(tempElm, { bRunScripts: true, bTiming: this.Settings.bTiming }, false);
                                            range.hdrElms = R.AddedHeaderElements;
                                            const subArea = { parent: shadowRoot, range: null, parentR: new Range(null, null, 'Shadow') };
                                            yield R.InitialBuild(subArea);
                                        }
                                        catch (err) {
                                            shadowRoot.appendChild(createErrorNode(`Compile error: ${err}`));
                                        }
                                        finally {
                                            env = savedEnv;
                                        }
                                    }
                                });
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
                            const newVar = this.NewVar(atts.get('name', true)), bEncaps = CBool(atts.get('encapsulate')), params = atts.get('params'), RC = this, saved = this.SaveContext(), setVars = ((params === null || params === void 0 ? void 0 : params.split(',')) || []).map(v => this.NewVar(v));
                            try {
                                const docBuilder = RC.CompChildNodes(srcElm), docDef = (docEnv) => {
                                    docEnv = CloneEnv(docEnv);
                                    return {
                                        render(parent, args) {
                                            return __awaiter(this, void 0, void 0, function* () {
                                                parent.innerHTML = '';
                                                const savedEnv = env;
                                                let i = 0;
                                                env = docEnv;
                                                for (const init of setVars)
                                                    init()(args[i++]);
                                                try {
                                                    yield docBuilder.call(RC, { parent });
                                                }
                                                finally {
                                                    env = savedEnv;
                                                }
                                            });
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
                                        print(...args) {
                                            return __awaiter(this, void 0, void 0, function* () {
                                                const iframe = document.createElement('iframe');
                                                iframe.setAttribute('style', 'display:none');
                                                document.body.appendChild(iframe);
                                                if (!bEncaps)
                                                    copyStyleSheets(document, iframe.contentDocument);
                                                yield this.render(iframe.contentDocument.body, args);
                                                iframe.contentWindow.print();
                                                iframe.remove();
                                            });
                                        }
                                    };
                                };
                                builder = function DOCUMENT() {
                                    return __awaiter(this, void 0, void 0, function* () {
                                        newVar()(docDef(env));
                                    });
                                };
                                isBlank = 1;
                            }
                            finally {
                                this.RestoreContext(saved);
                            }
                        }
                        ;
                        break;
                    case 'rhead':
                        {
                            const childBuilder = this.CompChildNodes(srcElm), { wspc } = this;
                            this.wspc = this.rspc = WSpc.block;
                            builder = function HEAD(area) {
                                return __awaiter(this, void 0, void 0, function* () {
                                    const { subArea } = PrepArea(srcElm, area);
                                    subArea.parent = area.parent.ownerDocument.head;
                                    yield childBuilder.call(this, subArea);
                                });
                            };
                            this.wspc = wspc;
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
        if (depOnerror || depOnsuccess) {
            const b = builder;
            builder = function SetOnError(area) {
                return __awaiter(this, void 0, void 0, function* () {
                    const save = { onerror, onsuccess };
                    try {
                        if (depOnerror) {
                            onerror = depOnerror();
                            onerror.bBldr = depOnerror.bBldr;
                        }
                        if (depOnsuccess)
                            onsuccess = depOnsuccess();
                        yield b.call(this, area);
                    }
                    finally {
                        ({ onerror, onsuccess } = save);
                    }
                });
            };
        }
        if (genMods.length) {
            const b = builder;
            builder = function ON(area) {
                var _a;
                return __awaiter(this, void 0, void 0, function* () {
                    const { range } = area;
                    yield b.call(this, area);
                    for (const g of genMods)
                        if (range ? g.bUpd : g.bCr)
                            g.handler().call((_a = (range || area.prevR)) === null || _a === void 0 ? void 0 : _a.node);
                });
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
        function REACT(area) {
            return __awaiter(this, void 0, void 0, function* () {
                let range, subArea, bInit;
                if (getRvars) {
                    ({ range, subArea, bInit } = PrepArea(srcElm, area, attName));
                    area = subArea;
                }
                if (bRenew)
                    area = PrepArea(srcElm, area, 'renew', 2).subArea;
                yield builder.call(this, area);
                if (getRvars) {
                    const rvars = getRvars();
                    let subscriber, pVars;
                    if (bInit)
                        subscriber = this.Subscriber(subArea, updateBuilder, range.child);
                    else {
                        ({ subscriber, rvars: pVars } = range.value);
                        assignEnv(subscriber.env, env);
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
                        catch (_a) {
                            throw `[${attName}] This is not an RVAR`;
                        }
                    }
                }
            });
        }
        REACT.ws = builder.ws;
        return REACT;
    }
    CallWithHandling(builder, srcNode, area) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            let { range } = area;
            if (range && range.errorNode) {
                area.parent.removeChild(range.errorNode);
                range.errorNode = undefined;
            }
            try {
                return yield builder.call(this, area);
            }
            catch (err) {
                const message = srcNode instanceof HTMLElement ? `${OuterOpenTag(srcNode, 40)} ${err}` : err;
                if (this.Settings.bAbortOnError)
                    throw message;
                console.log(message);
                if (onerror === null || onerror === void 0 ? void 0 : onerror.bBldr)
                    onerror(err);
                else if (this.Settings.bShowErrors) {
                    const errorNode = area.parent.insertBefore(createErrorNode(message), (_a = area.range) === null || _a === void 0 ? void 0 : _a.FirstOrNext);
                    if (range)
                        range.errorNode = errorNode;
                }
            }
        });
    }
    CompScript(srcParent, srcElm, atts) {
        var _a;
        const bModule = ((_a = atts.get('type')) === null || _a === void 0 ? void 0 : _a.toLowerCase()) == 'module', bNoModule = atts.get('nomodule') != null, defines = atts.get('defines');
        let src = atts.get('src');
        let builder;
        if (bNoModule || this.Settings.bRunScripts) {
            let script = srcElm.text + '\n';
            const lvars = [];
            if (defines)
                for (const name of defines.split(','))
                    lvars.push({ name, init: this.NewVar(name) });
            let exports;
            builder = function SCRIPT() {
                return __awaiter(this, void 0, void 0, function* () {
                    if (!(bModule || bNoModule || defines || this.Settings.bRunScripts)) {
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
                                exports = yield import(this.GetURL(src));
                            else
                                try {
                                    script = script.replace(/(\sfrom\s*['"])([^'"]*)(['"])/g, (_, p1, p2, p3) => `${p1}${this.GetURL(p2)}${p3}`);
                                    const src = URL.createObjectURL(new Blob([script], { type: 'application/javascript' }));
                                    exports = yield import(src);
                                }
                                finally {
                                    URL.revokeObjectURL(src);
                                }
                        }
                        for (const { name, init } of lvars) {
                            if (!(name in exports))
                                throw `'${name}' is not exported by this script`;
                            init()(exports[name]);
                        }
                    }
                    else {
                        if (!exports) {
                            if (src)
                                script = yield this.FetchText(src);
                            exports = gEval(`'use strict'\n;${script};[${defines}]\n`);
                        }
                        let i = 0;
                        for (const { init } of lvars)
                            init()(exports[i++]);
                    }
                });
            };
        }
        else if (defines)
            throw `You must add 'nomodule' if this script has to define OtoReact variables`;
        atts.clear();
        return builder;
    }
    CompFor(srcParent, srcElm, atts) {
        var _a, _b;
        const varName = (_a = atts.get('let')) !== null && _a !== void 0 ? _a : atts.get('var');
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
                const getRange = this.CompAttrExpr(atts, 'of', true), getUpdatesTo = this.CompAttrExpr(atts, 'updates'), bReacting = CBool((_b = atts.get('reacting')) !== null && _b !== void 0 ? _b : atts.get('reactive')) || !!getUpdatesTo, initVar = this.NewVar(varName), initIndex = this.NewVar(indexName), initPrevious = this.NewVar(prevName), initNext = this.NewVar(nextName), getKey = this.CompAttrExpr(atts, 'key'), getHash = this.CompAttrExpr(atts, 'hash'), bodyBuilder = this.CompChildNodes(srcElm);
                return function FOR(area) {
                    var e_1, _a;
                    var _b, _c, _d;
                    return __awaiter(this, void 0, void 0, function* () {
                        const { range, subArea } = PrepArea(srcElm, area, ''), { parent } = subArea, before = subArea.before !== undefined ? subArea.before : range.Next, savedEnv = SaveEnv();
                        try {
                            const keyMap = range.value || (range.value = new Map()), newMap = new Map(), setVar = initVar(), setIndex = initIndex();
                            let iterable = getRange();
                            if (iterable) {
                                if (iterable instanceof Promise)
                                    iterable = yield iterable;
                                if (!(iterable[Symbol.iterator] || iterable[Symbol.asyncIterator]))
                                    throw `[of]: Value (${iterable}) is not iterable`;
                                let idx = 0;
                                try {
                                    for (var iterable_1 = __asyncValues(iterable), iterable_1_1; iterable_1_1 = yield iterable_1.next(), !iterable_1_1.done;) {
                                        const item = iterable_1_1.value;
                                        setVar(item);
                                        setIndex(idx);
                                        const hash = getHash && getHash();
                                        const key = (_b = getKey === null || getKey === void 0 ? void 0 : getKey()) !== null && _b !== void 0 ? _b : hash;
                                        if (key != null && newMap.has(key))
                                            throw `Key '${key}' is not unique`;
                                        newMap.set(key !== null && key !== void 0 ? key : {}, { item, hash, idx });
                                        idx++;
                                    }
                                }
                                catch (e_1_1) { e_1 = { error: e_1_1 }; }
                                finally {
                                    try {
                                        if (iterable_1_1 && !iterable_1_1.done && (_a = iterable_1.return)) yield _a.call(iterable_1);
                                    }
                                    finally { if (e_1) throw e_1.error; }
                                }
                            }
                            let nextChild = range.child;
                            const setPrevious = initPrevious(), setNext = initNext(), iterator = newMap.entries(), nextIterator = nextName ? newMap.values() : null;
                            let prevItem, nextItem, prevRange = null, childArea;
                            subArea.parentR = range;
                            if (nextIterator)
                                nextIterator.next();
                            while (true) {
                                let k;
                                while (nextChild && !newMap.has(k = nextChild.key)) {
                                    if (k != null)
                                        keyMap.delete(k);
                                    nextChild.erase(parent);
                                    nextChild.prev = null;
                                    nextChild = nextChild.next;
                                }
                                const { value } = iterator.next();
                                if (!value)
                                    break;
                                const [key, { item, hash, idx }] = value;
                                if (nextIterator)
                                    nextItem = (_c = nextIterator.next().value) === null || _c === void 0 ? void 0 : _c.item;
                                let childRange = keyMap.get(key), bInit = !childRange;
                                if (bInit) {
                                    subArea.range = null;
                                    subArea.prevR = prevRange;
                                    subArea.before = (nextChild === null || nextChild === void 0 ? void 0 : nextChild.FirstOrNext) || before;
                                    ;
                                    ({ range: childRange, subArea: childArea } = PrepArea(null, subArea, `${varName}(${idx})`));
                                    if (key != null) {
                                        if (keyMap.has(key))
                                            throw `Duplicate key '${key}'`;
                                        keyMap.set(key, childRange);
                                    }
                                    childRange.key = key;
                                }
                                else {
                                    if (childRange.fragm) {
                                        const nextNode = (nextChild === null || nextChild === void 0 ? void 0 : nextChild.FirstOrNext) || before;
                                        parent.insertBefore(childRange.fragm, nextNode);
                                        childRange.fragm = null;
                                    }
                                    else
                                        while (true) {
                                            if (nextChild == childRange)
                                                nextChild = nextChild.next;
                                            else {
                                                const nextIndex = (_d = newMap.get(nextChild.key)) === null || _d === void 0 ? void 0 : _d.idx;
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
                                                const nextNode = (nextChild === null || nextChild === void 0 ? void 0 : nextChild.FirstOrNext) || before;
                                                for (const node of childRange.Nodes())
                                                    parent.insertBefore(node, nextNode);
                                            }
                                            break;
                                        }
                                    childRange.next = nextChild;
                                    childRange.text = `${varName}(${idx})`;
                                    if (prevRange)
                                        prevRange.next = childRange;
                                    else
                                        range.child = childRange;
                                    subArea.range = childRange;
                                    childArea = PrepArea(null, subArea, '').subArea;
                                    subArea.parentR = null;
                                }
                                childRange.prev = prevRange;
                                prevRange = childRange;
                                if (hash == null
                                    || hash != childRange.hash
                                        && (childRange.hash = hash, true)) {
                                    let rvar;
                                    if (bReacting) {
                                        if (item === childRange.rvar)
                                            rvar = item;
                                        else {
                                            rvar = this.RVAR_Light(item, getUpdatesTo && [getUpdatesTo()]);
                                            if (childRange.rvar)
                                                rvar._Subscribers = childRange.rvar._Subscribers;
                                        }
                                    }
                                    setVar(rvar || item);
                                    setIndex(idx);
                                    setPrevious(prevItem);
                                    if (nextIterator)
                                        setNext(nextItem);
                                    yield bodyBuilder.call(this, childArea);
                                    if (rvar)
                                        if (childRange.rvar)
                                            assignEnv(childRange.subs.env, env);
                                        else
                                            rvar.Subscribe(childRange.subs = this.Subscriber(childArea, bodyBuilder, childRange.child));
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
                    });
                };
            }
            else {
                const slotName = atts.get('of', true, true).toLowerCase();
                const slot = this.CSignatures.get(slotName);
                if (!slot)
                    throw `Missing attribute [let]`;
                const initIndex = this.NewVar(indexName);
                const bodyBuilder = this.CompChildNodes(srcElm);
                return function FOREACH_Slot(area) {
                    return __awaiter(this, void 0, void 0, function* () {
                        const { subArea } = PrepArea(srcElm, area), saved = SaveEnv(), slotDef = env.constructs.get(slotName), setIndex = initIndex();
                        try {
                            let index = 0;
                            for (const slotBuilder of slotDef.templates) {
                                setIndex(index++);
                                env.constructs.set(slotName, { templates: [slotBuilder], constructEnv: slotDef.constructEnv });
                                yield bodyBuilder.call(this, subArea);
                            }
                        }
                        finally {
                            mapSet(env.constructs, slotName, slotDef);
                            RestoreEnv(saved);
                        }
                    });
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
                            : m[3] ? /^on/.test(m[2]) ? () => _ => null : DUndef
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
        const builders = [], bEncaps = CBool(atts.get('encapsulate')), styles = [], { wspc } = this;
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
        this.wspc = wspc;
        return function COMPONENT(area) {
            return __awaiter(this, void 0, void 0, function* () {
                for (const [bldr, srcNode] of builders)
                    yield this.CallWithHandling(bldr, srcNode, area);
                const construct = { templates, constructEnv: undefined };
                DefConstruct(signature.name, construct);
                construct.constructEnv = CloneEnv(env);
            });
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
            return function TEMPLATE(area, args, mSlotTemplates, slotEnv) {
                var _a;
                return __awaiter(this, void 0, void 0, function* () {
                    const saved = SaveEnv();
                    try {
                        for (const [slotName, templates] of mSlotTemplates)
                            DefConstruct(slotName, { templates, constructEnv: slotEnv });
                        let i = 0;
                        for (const [name, lvar] of lvars) {
                            let arg = args[name], dflt;
                            if (arg === undefined && (dflt = (_a = signat.Params[i]) === null || _a === void 0 ? void 0 : _a.pDefault))
                                arg = dflt();
                            lvar()(arg);
                            i++;
                        }
                        if (bEncaps) {
                            const { range: elmRange, childArea, bInit } = PrepareElement(srcElm, area, customName), elm = elmRange.node, shadow = elm.shadowRoot || elm.attachShadow({ mode: 'open' });
                            if (bInit)
                                for (const style of styles)
                                    shadow.appendChild(style.cloneNode(true));
                            if (signat.RestParam)
                                ApplyModifier(elm, MType.RestArgument, null, args[signat.RestParam.name], bInit);
                            childArea.parent = shadow;
                            area = childArea;
                        }
                        yield builder.call(this, area);
                    }
                    finally {
                        RestoreEnv(saved);
                    }
                });
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
                    getArgs.set(name, () => this.RVAR('', depValue(), null, setter()));
                }
                else
                    getArgs.set(name, () => this.RVAR('', pDefault()));
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
            getArgs.set(RestParam.name, () => modifs.map(({ mType: modType, name, depV: depValue }) => ({ modType, name, value: depValue() })));
        }
        atts.CheckNoAttsLeft();
        this.wspc = WSpc.inline;
        return function INSTANCE(area) {
            return __awaiter(this, void 0, void 0, function* () {
                const savedEnv = env, cdef = env.constructs.get(name), { subArea } = PrepArea(srcElm, area);
                if (!cdef)
                    return;
                bReadOnly = true;
                const args = {};
                for (const [nm, getArg] of getArgs)
                    args[nm] = getArg();
                bReadOnly = false;
                env = cdef.constructEnv;
                try {
                    for (const template of cdef.templates)
                        yield template.call(this, subArea, args, slotBuilders, savedEnv);
                }
                finally {
                    env = savedEnv;
                }
            });
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
            postWs = this.wspc = this.rspc = WSpc.block;
        }
        else if (RCompiler.regInline.test(name)) {
            this.wspc = this.rspc = WSpc.block;
            postWs = WSpc.inline;
        }
        if (preWs == WSpc.preserve)
            postWs = WSpc.preserve;
        const modifs = this.CompAttributes(atts);
        const childnodesBuilder = this.CompChildNodes(srcElm);
        if (postWs)
            this.wspc = postWs;
        const builder = function ELEMENT(area) {
            return __awaiter(this, void 0, void 0, function* () {
                const { range: { node }, childArea, bInit } = PrepareElement(srcElm, area, name);
                if (!area.bNoChildBuilding)
                    yield childnodesBuilder.call(this, childArea);
                node.removeAttribute('class');
                if (node.handlers) {
                    for (const { evType, listener } of node.handlers)
                        node.removeEventListener(evType, listener);
                }
                node.handlers = [];
                ApplyModifiers(node, modifs, bInit);
            });
        };
        builder.ws = (postWs == WSpc.block) || preWs < WSpc.preserve && childnodesBuilder.ws;
        return builder;
    }
    CompAttributes(atts) {
        const modifs = [];
        for (let [aName, aVal] of atts) {
            aName = aName.replace(/\.+$/, '');
            let m;
            try {
                if (m = /^on(.*?)\.*$/i.exec(aName))
                    modifs.push({
                        mType: MType.Event,
                        name: CapitalProp(m[0]),
                        depV: this.AddErrHandler(this.CompHandler(aName, aVal))
                    });
                else if (m = /^#class[:.](.*)$/.exec(aName))
                    modifs.push({
                        mType: MType.Class, name: m[1],
                        depV: this.CompJScript(aVal, aName)
                    });
                else if (m = /^#style\.(.*)$/.exec(aName))
                    modifs.push({
                        mType: MType.Style, name: CapitalProp(m[1]),
                        depV: this.CompJScript(aVal, aName)
                    });
                else if (m = /^style\.(.*)$/.exec(aName))
                    modifs.push({
                        mType: MType.Style, name: CapitalProp(m[1]),
                        depV: this.CompString(aVal, aName)
                    });
                else if (aName == '+style')
                    modifs.push({
                        mType: MType.AddToStyle, name: null,
                        depV: this.CompJScript(aVal, aName)
                    });
                else if (aName == "+class")
                    modifs.push({
                        mType: MType.AddToClassList, name: null,
                        depV: this.CompJScript(aVal, aName)
                    });
                else if (m = /^([\*\+#!]+|@@?)(.*?)\.*$/.exec(aName)) {
                    const name = CapitalProp(m[2]);
                    try {
                        const setter = m[1] == '#' ? null : this.CompJScript(`function(){const ORx=this.${name};if(${aVal}!==ORx)${aVal}=ORx}`, aName);
                        if (/[@#]/.test(m[1])) {
                            let depV = this.CompJScript(aVal, aName);
                            if (/^on/.test(name))
                                modifs.push({ mType: MType.Event, name, depV: this.AddErrHandler(depV) });
                            else
                                modifs.push({ mType: MType.Prop, name, depV });
                        }
                        if (/\*/.test(m[1]))
                            modifs.push({ mType: MType.oncreate, name: 'oncreate', depV: setter });
                        if (/\+/.test(m[1]))
                            modifs.push({ mType: MType.onupdate, name: 'onupdate', depV: setter });
                        if (/[@!]/.test(m[1]))
                            modifs.push({ mType: MType.Event,
                                name: /!!|@@/.test(m[1]) ? 'onchange' : 'oninput',
                                depV: setter });
                    }
                    catch (err) {
                        throw `Invalid left-hand side '${aVal}'`;
                    }
                }
                else if (m = /^\.\.\.(.*)/.exec(aName)) {
                    if (aVal)
                        throw `A rest parameter cannot have a value`;
                    modifs.push({
                        mType: MType.RestArgument, name: null,
                        depV: this.CompName(m[1])
                    });
                }
                else if (aName == 'src')
                    modifs.push({
                        mType: MType.Src,
                        name: this.FilePath,
                        depV: this.CompString(aVal, aName),
                    });
                else
                    modifs.push({
                        mType: MType.Attr,
                        name: aName,
                        depV: this.CompString(aVal, aName)
                    });
            }
            catch (err) {
                throw (`[${aName}]: ${err}`);
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
        const regIS = this.regIS || (this.regIS = new RegExp(/(?<![\\$])/.source
            + (this.Settings.bDollarRequired ? '\\$' : '\\$?')
            + /\{((\{(\{.*?\}|.)*?\}|'.*?'|".*?"|`.*?`|.)*?)(?<!\\)\}|$/.source, 'gs')), generators = [], ws = name || this.Settings.bKeepWhiteSpace ? WSpc.preserve : this.wspc;
        let isTrivial = true, bThis = false;
        regIS.lastIndex = 0;
        while (regIS.lastIndex < data.length) {
            const lastIndex = regIS.lastIndex, m = regIS.exec(data);
            let fixed = lastIndex < m.index ? data.substring(lastIndex, m.index) : null;
            if (fixed) {
                fixed = fixed.replace(/\\([${}\\])/g, '$1');
                if (ws < WSpc.preserve) {
                    fixed = fixed.replace(/[ \t\n\r]+/g, ' ');
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
                bThis || (bThis = getS.bThis);
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
                function () {
                    var _a;
                    try {
                        let result = "";
                        for (const gen of generators)
                            result += typeof gen == 'string' ? gen : (_a = gen.call(this)) !== null && _a !== void 0 ? _a : '';
                        return result;
                    }
                    catch (err) {
                        throw name ? `[${name}]: ${err}` : err;
                    }
                }
                : () => {
                    var _a;
                    try {
                        let result = "";
                        for (const gen of generators)
                            result += typeof gen == 'string' ? gen : (_a = gen()) !== null && _a !== void 0 ? _a : '';
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
        return /^#/.test(name) ? this.CompJScript(text, name)
            : this.CompJScript(`function(event){${text}\n}`, name);
    }
    CompJScript(expr, descript, delims = '""') {
        if (expr == null)
            return null;
        const bThis = /\bthis\b/.test(expr), depExpr = bThis ?
            `'use strict';(function expr([${this.context}]){return (${expr}\n)})`
            : `'use strict';([${this.context}])=>(${expr}\n)`, errorInfo = `${descript ? `[${descript}] ` : ''}${delims[0]}${Abbreviate(expr, 60)}${delims[1]}: `;
        try {
            const routine = gEval(depExpr), depValue = (bThis
                ? function () {
                    try {
                        return routine.call(this, env);
                    }
                    catch (err) {
                        throw errorInfo + err;
                    }
                }
                : () => {
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
        return () => env[i];
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
    AddErrHandler(getHndlr) {
        return () => {
            const hndlr = getHndlr(), onerr = onerror, onsucc = onsuccess;
            if (hndlr && (onerr || onsucc))
                return function hError(ev) {
                    try {
                        const result = hndlr.call(this, ev);
                        if (result instanceof Promise)
                            return result.then(onsucc, onerr);
                        if (onsucc)
                            onsucc(null);
                        return result;
                    }
                    catch (err) {
                        if (!onerr)
                            throw err;
                        onerr(err);
                    }
                };
            return hndlr;
        };
    }
    GetURL(src) {
        return new URL(src, this.FilePath).href;
    }
    GetPath(src) {
        return this.GetURL(src).replace(/[^/]*$/, '');
    }
    FetchText(src) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield (yield RFetch(this.GetURL(src))).text();
        });
    }
}
RCompiler.iNum = 0;
RCompiler.genAtts = /^(?:((?:this)?reacts?on)|#?on((?:create|\*)|(?:update|\+))+|#?on(?:(error)-?|success))$/;
RCompiler.regBlock = /^(body|blockquote|d[dlt]|div|form|h\d|hr|li|ol|p|table|t[rhd]|ul|select|title)$/;
RCompiler.regInline = /^(button|input|img)$/;
const gFetch = fetch;
export function RFetch(input, init) {
    return __awaiter(this, void 0, void 0, function* () {
        const r = yield gFetch(input, init);
        if (!r.ok)
            throw `${(init === null || init === void 0 ? void 0 : init.method) || 'GET'} ${input} returned ${r.status} ${r.statusText}`;
        return r;
    });
}
globalThis.RFetch = RFetch;
function quoteReg(fixed) {
    return fixed.replace(/[.()?*+^$\\]/g, s => `\\${s}`);
}
class _RVAR {
    constructor(RC, name, initialValue, store, storeName = `RVAR_${name}`) {
        this.RC = RC;
        this.store = store;
        this.storeName = storeName;
        this._Subscribers = new Set();
        if (name)
            globalThis[name] = this;
        const s = store && store.getItem(storeName);
        if (s != null)
            try {
                this._Value = JSON.parse(s);
                return;
            }
            catch (_a) { }
        this.SetAsync(initialValue);
    }
    Subscribe(s, bImmediate, bInit = bImmediate) {
        if (bInit)
            s();
        s.bImm = bImmediate;
        s.ref || (s.ref = {});
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
    SetAsync(t) {
        if (t instanceof Promise) {
            this.V = undefined;
            t.then(v => { this.V = v; }, onerror);
        }
        else
            this.V = t;
    }
    get Set() {
        return this.SetAsync.bind(this);
    }
    get U() {
        if (!bReadOnly)
            this.SetDirty();
        return this._Value;
    }
    set U(t) { this._Value = t; this.SetDirty(); }
    SetDirty() {
        var _a, _b;
        if (this.store)
            this.RC.DirtyVars.add(this);
        let b;
        for (const sub of this._Subscribers)
            if (sub.bImm)
                sub(this._Value);
            else if (!((_b = (_a = sub.sArea) === null || _a === void 0 ? void 0 : _a.range) === null || _b === void 0 ? void 0 : _b.erased)) {
                this.RC.AddDirty(sub);
                b = true;
            }
            else
                this._Subscribers.delete(sub);
        if (b)
            this.RC.RUpdate();
    }
    Save() {
        this.store.setItem(this.storeName, JSON.stringify(this._Value));
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
const words = '(?:access|active|align|animation|aria|background|blend|border|bottom|bounding|break'
    + '|caption|caret|character|child|class|client|clip|(?:col|row)(?=span)|column|content|default|design|document|element'
    + '|feature|fill|first|font|form|get|grid|image|inner|input|^is|last|left|line|margin|^max|^min|next|node|offset|outer'
    + '|outline|overflow|owner|padding|parent|previous|ready?|right|size|rule|scroll|selected|selection'
    + '|table|tab(?=index)|tag|text|top|validation|value|valueas|variant|will)';
const regCapitalize = new RegExp(`html|uri|(?<=${words})[a-z]`, "g");
function CapitalProp(lcName) {
    return lcName.replace(regCapitalize, (char) => char.toUpperCase());
}
function OuterOpenTag(elm, maxLength) {
    return Abbreviate(/<.*?(?=>)/s.exec(elm.outerHTML)[0], maxLength - 1) + '>';
}
function Abbreviate(s, maxLength) {
    return (maxLength && s.length > maxLength
        ? s.substring(0, maxLength - 3) + "..."
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
function mapSet(m, k, v) {
    if (v)
        m.set(k, v);
    else
        m.delete(k);
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
Object.defineProperty(docLocation, 'subpath', { get: () => location.pathname.substring(BasePath.length) });
window.addEventListener('popstate', () => { docLocation.V = location.href; });
function ScrollToHash() {
    if (location.hash)
        setTimeout((() => { var _a; return (_a = document.getElementById(location.hash.substring(1))) === null || _a === void 0 ? void 0 : _a.scrollIntoView(); }), 6);
}
docLocation.Subscribe(() => {
    if (docLocation.V != location.href) {
        history.pushState(null, null, docLocation.V);
    }
    docLocation.searchParams = new URLSearchParams(location.search);
    ScrollToHash();
    ;
}, true);
export const reroute = globalThis.reroute =
    (arg) => {
        if (typeof arg != 'string') {
            if (arg.ctrlKey)
                return;
            arg.preventDefault();
            arg = arg.target.href;
        }
        docLocation.V = new URL(arg, location.href).href;
    };
