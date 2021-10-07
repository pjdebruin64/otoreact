const defaultSettings = {
    bAbortOnError: false,
    bShowErrors: true,
    bRunScripts: false,
    bBuild: true,
    rootPattern: '/|^',
};
var WhiteSpace;
(function (WhiteSpace) {
    WhiteSpace[WhiteSpace["preserve"] = 0] = "preserve";
    WhiteSpace[WhiteSpace["keep"] = 1] = "keep";
    WhiteSpace[WhiteSpace["trim"] = 2] = "trim";
})(WhiteSpace || (WhiteSpace = {}));
class Range {
    node;
    text;
    child;
    next = null;
    endMark;
    constructor(node, text) {
        this.node = node;
        this.text = text;
        if (!node)
            this.child = null;
    }
    toString() { return this.text || this.node?.nodeName; }
    result;
    value;
    errorNode;
    hash;
    key;
    prev;
    fragm;
    rvar;
    updated;
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
function PrepareArea(srcElm, area, text = '', bMark, result) {
    let { parent, env, range, before } = area, subArea = { parent, env, range: null, }, bInit = !range;
    if (bInit) {
        subArea.source = area.source;
        if (srcElm)
            text = `${srcElm.localName}${text ? ' ' : ''}${text}`;
        UpdatePrevArea(area, range = subArea.parentR = new Range(null, text));
        range.result = result;
        if (bMark)
            before = range.endMark ||= parent.insertBefore(document.createComment('/' + text), before);
    }
    else {
        subArea.range = range.child;
        area.range = range.next;
        if (bMark) {
            before = range.endMark;
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
    subArea.before = before;
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
        childArea: { parent: elmRange.node, range: elmRange.child, before: null, env: area.env,
            parentR: elmRange },
        bInit };
}
function PrepareText(area, content) {
    let range = area.range;
    if (!range) {
        range = new Range(area.parent.insertBefore(document.createTextNode(content), area.before), 'text');
        UpdatePrevArea(area, range);
    }
    else {
        range.node.data = content;
        area.range = range.next;
    }
}
const location = document.location;
let RootPath = null;
export function RCompile(elm, settings) {
    const R = RHTML;
    try {
        const { rootPattern } = R.Settings = { ...defaultSettings, ...settings }, m = location.href.match(`^.*(${rootPattern})`);
        if (!m)
            throw `Root pattern '${rootPattern}' does not match URL '${location.href}'`;
        R.FilePath = location.origin + (globalThis.RootPath = RootPath = (new URL(m[0])).pathname.replace(/[^/]*$/, ''));
        R.RootElm = elm;
        R.Compile(elm, {}, true);
        R.ToBuild.push({ parent: elm.parentElement, env: NewEnv(), source: elm, range: null });
        return (R.Settings.bBuild
            ? R.DoUpdate().then(() => { elm.hidden = false; })
            : null);
    }
    catch (err) {
        window.alert(`OtoReact error: ${err}`);
    }
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
    srcElm;
    constructor(srcElm) {
        this.srcElm = srcElm;
        this.name = srcElm.localName;
    }
    name;
    Parameters = [];
    RestParam = null;
    Slots = new Map();
    IsCompatible(sig) {
        if (!sig)
            return false;
        let result = true;
        const mapSigParams = new Map(sig.Parameters.map(p => [p.name, p.pDefault]));
        for (const { name, pDefault } of this.Parameters)
            if (mapSigParams.has(name)) {
                result &&= (!pDefault || mapSigParams.get(name));
                mapSigParams.delete(name);
            }
            else
                result = false;
        for (const pDefault of mapSigParams.values())
            result &&= pDefault;
        result &&= !this.RestParam || this.RestParam.name == sig.RestParam?.name;
        for (let [slotname, slotSig] of this.Slots)
            result &&= sig.Slots.get(slotname)?.IsCompatible(slotSig);
        return !!result;
    }
}
const gEval = eval, gFetch = fetch;
var ModifType;
(function (ModifType) {
    ModifType[ModifType["Attr"] = 0] = "Attr";
    ModifType[ModifType["Prop"] = 1] = "Prop";
    ModifType[ModifType["Src"] = 2] = "Src";
    ModifType[ModifType["Class"] = 3] = "Class";
    ModifType[ModifType["Style"] = 4] = "Style";
    ModifType[ModifType["Event"] = 5] = "Event";
    ModifType[ModifType["AddToStyle"] = 6] = "AddToStyle";
    ModifType[ModifType["AddToClassList"] = 7] = "AddToClassList";
    ModifType[ModifType["RestArgument"] = 8] = "RestArgument";
    ModifType[ModifType["oncreate"] = 9] = "oncreate";
})(ModifType || (ModifType = {}));
let bReadOnly = false;
function ApplyModifier(elm, modType, name, val, bCreate) {
    switch (modType) {
        case ModifType.Attr:
            elm.setAttribute(name, val);
            break;
        case ModifType.Src:
            elm.setAttribute('src', new URL(val, name).href);
            break;
        case ModifType.Prop:
            if (val != null) {
                if (val !== elm[name])
                    elm[name] = val;
            }
            else
                delete elm[name];
            break;
        case ModifType.Event:
            let m;
            if (val)
                if (m = /^on(input|change)$/.exec(name)) {
                    elm.addEventListener(m[1], val);
                    elm.handlers.push({ evType: m[1], listener: val });
                }
                else
                    elm[name] = val;
            break;
        case ModifType.Class:
            if (val)
                elm.classList.add(name);
            break;
        case ModifType.Style:
            if (val !== undefined && val !== false)
                elm.style[name] = val || '';
            break;
        case ModifType.AddToStyle:
            if (val)
                Object.assign(elm.style, val);
            break;
        case ModifType.AddToClassList:
            if (Array.isArray(val))
                for (const className of val)
                    elm.classList.add(className);
            else
                for (const [className, bln] of Object.entries(val))
                    if (bln)
                        elm.classList.add(className);
            break;
        case ModifType.RestArgument:
            for (const { modType, name, value } of val)
                ApplyModifier(elm, modType, name, value, bCreate);
            break;
        case ModifType.oncreate:
            if (bCreate)
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
    const { constructs: constructDefs } = env, prevDef = constructDefs.get(name);
    constructDefs.set(name, construct);
    envActions.push(() => { constructDefs.set(name, prevDef); });
}
class RCompiler {
    clone;
    static iNum = 0;
    instanceNum = RCompiler.iNum++;
    ContextMap;
    context;
    CSignatures;
    StyleRoot;
    StyleBefore;
    AddedHeaderElements;
    FilePath;
    RootElm;
    constructor(clone) {
        this.clone = clone;
        this.context = clone?.context || "";
        this.ContextMap = clone ? new Map(clone.ContextMap) : new Map();
        this.CSignatures = clone ? new Map(clone.CSignatures) : new Map();
        this.Settings = clone ? { ...clone.Settings } : { ...defaultSettings };
        this.AddedHeaderElements = clone?.AddedHeaderElements || [];
        this.StyleRoot = clone?.StyleRoot || document.head;
        this.StyleBefore = clone?.StyleBefore;
        this.FilePath = clone?.FilePath || location.origin + RootPath;
    }
    get MainC() { return this.clone || this; }
    restoreActions = [];
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
            let i = this.ContextMap.get(name);
            const bNewName = i == null;
            if (bNewName) {
                const savedContext = this.context;
                i = this.ContextMap.size;
                this.ContextMap.set(name, i);
                this.context += `${name},`;
                this.restoreActions.push(() => {
                    this.ContextMap.delete(name);
                    this.context = savedContext;
                });
            }
            init = ((env) => {
                const prev = env[i], j = i;
                envActions.push(() => { env[j] = prev; });
                return (value) => { env[j] = value; };
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
        Object.assign(this.Settings, settings);
        const t0 = performance.now();
        const savedR = RHTML;
        try {
            if (!this.clone)
                RHTML = this;
            this.Builder =
                bIncludeSelf
                    ? this.CompElement(elm.parentElement, elm)[0]
                    : this.CompChildNodes(elm);
            this.bCompiled = true;
        }
        finally {
            RHTML = savedR;
        }
        const t1 = performance.now();
        console.log(`Compiled ${this.sourceNodeCount} nodes in ${(t1 - t0).toFixed(1)} ms`);
    }
    Subscriber({ parent, before, bNoChildBuilding, env }, builder, range) {
        const sArea = {
            parent, before, bNoChildBuilding,
            env: CloneEnv(env),
            range,
        };
        return {
            ref: before,
            updater: async () => {
                this.builtNodeCount++;
                await builder.call(this, { ...sArea });
            },
            sArea: sArea,
        };
    }
    async InitialBuild(area) {
        const savedRCompiler = RHTML, { parentR } = area;
        RHTML = this;
        this.builtNodeCount++;
        await this.Builder(area);
        this.AllAreas.push(this.Subscriber(area, this.Builder, parentR ? parentR.child : area.prevR));
        RHTML = savedRCompiler;
    }
    Settings;
    ToBuild = [];
    AllAreas = [];
    Builder;
    whiteSpc = WhiteSpace.keep;
    bCompiled = false;
    bHasReacts = false;
    DirtyVars = new Set();
    DirtySubs = new Map();
    AddDirty(sub) {
        this.MainC.DirtySubs.set(sub.ref, sub);
    }
    bUpdating = false;
    bUpdate = false;
    handleUpdate = null;
    RUpdate() {
        this.MainC.bUpdate = true;
        if (!this.clone && !this.bUpdating && !this.handleUpdate)
            this.handleUpdate = setTimeout(() => {
                this.handleUpdate = null;
                this.DoUpdate();
            }, 5);
    }
    ;
    start;
    async DoUpdate() {
        if (!this.bCompiled || this.bUpdating) {
            this.bUpdate = true;
            return;
        }
        for (let i = 0; i < 2; i++) {
            this.bUpdate = false;
            this.bUpdating = true;
            let savedRCompiler = RHTML;
            try {
                if (this.ToBuild.length) {
                    this.start = performance.now();
                    this.builtNodeCount = 0;
                    for (const area of this.ToBuild)
                        await this.InitialBuild(area);
                    console.log(`Built ${this.builtNodeCount} nodes in ${(performance.now() - this.start).toFixed(1)} ms`);
                    this.ToBuild = [];
                }
                else {
                    if (!this.MainC.bHasReacts)
                        for (const s of this.AllAreas)
                            this.AddDirty(s);
                    for (const rvar of this.DirtyVars)
                        rvar.Save();
                    this.DirtyVars.clear();
                    if (this.DirtySubs.size) {
                        if (!this.clone)
                            RHTML = this;
                        this.start = performance.now();
                        this.builtNodeCount = 0;
                        const subs = this.DirtySubs;
                        this.DirtySubs = new Map();
                        for (const sub of subs.values())
                            if (!sub.ref || sub.ref.isConnected)
                                try {
                                    await sub.updater();
                                }
                                catch (err) {
                                    const msg = `ERROR: ${err}`;
                                    console.log(msg);
                                    window.alert(msg);
                                }
                        console.log(`Updated ${this.builtNodeCount} nodes in ${(performance.now() - this.start).toFixed(1)} ms`);
                    }
                }
            }
            finally {
                RHTML = savedRCompiler;
                this.bUpdating = false;
            }
            if (!this.bUpdate)
                break;
        }
    }
    RVAR(name, initialValue, store) {
        return new _RVAR(this.MainC, name, initialValue, store, name);
    }
    ;
    RVAR_Light(t, updatesTo) {
        if (!t._Subscribers) {
            t._Subscribers = [];
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
            t.Subscribe = (sub) => { t._Subscribers.push(sub); };
        }
        return t;
    }
<<<<<<< HEAD
    CompChildNodes(srcParent, childNodes = srcParent.childNodes) {
        const saved = this.SaveContext();
=======
    sourceNodeCount = 0;
    builtNodeCount = 0;
    CompChildNodes(srcParent, childNodes = srcParent.childNodes, bNorestore) {
        const builders = [], saved = this.SaveContext();
>>>>>>> 0efe2af619161695d79ec2dca5534e98333e19cc
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
        const builders = [];
        for (const srcNode of iter) {
            switch (srcNode.nodeType) {
                case Node.ELEMENT_NODE:
                    this.sourceNodeCount++;
                    const builderElm = this.CompElement(srcParent, srcNode);
                    if (builderElm) {
                        if (builderElm[0].ws == WhiteSpace.trim) {
                            let i = builders.length - 1;
                            while (i >= 0 && builders[i][2]) {
                                builders.pop();
                                i--;
                            }
                        }
                        builders.push(builderElm);
                    }
                    break;
                case Node.TEXT_NODE:
                    this.sourceNodeCount++;
                    let str = srcNode.nodeValue;
                    if (this.whiteSpc != WhiteSpace.preserve)
                        str = str.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, ' ');
                    const getText = this.CompString(str), fixed = getText.fixed;
                    if (fixed !== '') {
                        if (fixed == undefined)
                            builders.push([
                                async (area) => {
                                    PrepareText(area, getText(area.env));
                                },
                                srcNode
                            ]);
                        else {
                            const isBlank = /^[ \t\r\n]*$/.test(fixed);
                            if (!(this.whiteSpc == WhiteSpace.trim && isBlank))
                                builders.push([
                                    async (area) => {
<<<<<<< HEAD
                                        PrepareText(area, fixed);
                                    },
                                    srcNode, isBlank
                                ]);
=======
                                        PrepareText(area, getText(area.env));
                                    }, srcNode
                                ]);
                            else {
                                const isBlank = /^[ \t\r\n]*$/.test(fixed);
                                if (!(this.whiteSpc == WhiteSpace.trim && isBlank))
                                    builders.push([
                                        async (area) => {
                                            PrepareText(area, fixed);
                                        }, srcNode, isBlank
                                    ]);
                            }
                            if (this.whiteSpc != WhiteSpace.preserve)
                                this.whiteSpc = /[ \t\r\n]$/.test(getText.last) ? WhiteSpace.trim : WhiteSpace.keep;
>>>>>>> 0efe2af619161695d79ec2dca5534e98333e19cc
                        }
                        if (this.whiteSpc != WhiteSpace.preserve)
                            this.whiteSpc = /[ \t\r\n]$/.test(getText.last) ? WhiteSpace.trim : WhiteSpace.keep;
                    }
                    break;
            }
        }
        return builders.length == 0 ? null :
            async function Iter(area) {
                for (const [builder, node] of builders)
                    await this.CallWithErrorHandling(builder, node, area);
                this.builtNodeCount += builders.length;
            };
    }
<<<<<<< HEAD
=======
    PreCompElement(srcParent, srcElm) {
        return null;
    }
    static preMods = ['reacton', 'reactson', 'thisreactson'];
>>>>>>> 0efe2af619161695d79ec2dca5534e98333e19cc
    CompElement(srcParent, srcElm) {
        const atts = new Atts(srcElm), reacts = [], genMods = [];
        for (const attName of RCompiler.genAtts)
            if (atts.has(attName))
                if (/^on/.test(attName))
                    genMods.push({ attName, handler: this.CompHandler(attName, atts.get(attName)) });
                else
                    reacts.push({ attName, rvars: this.compAttrExprList(atts, attName) });
        let builder = null;
        labelNoCheck: try {
            const construct = this.CSignatures.get(srcElm.localName);
            if (construct)
                builder = this.CompInstance(srcParent, srcElm, atts, construct);
            else {
                switch (srcElm.localName) {
                    case 'def':
                    case 'define':
                        {
                            const rvarName = atts.get('rvar'), varName = rvarName || atts.get('name') || atts.get('var', true), getValue = this.CompParameter(atts, 'value'), getStore = rvarName && this.CompAttrExpr(atts, 'store'), bReact = CBool(atts.get('reacting') ?? atts.get('updating')), newVar = this.NewVar(varName), subBuilder = this.CompChildNodes(srcElm);
                            builder = async function DEF(area) {
                                const { range, subArea, bInit } = PrepareArea(srcElm, area);
                                if (bInit || bReact) {
                                    const value = getValue && getValue(area.env);
                                    if (rvarName)
                                        if (bInit)
                                            range.value = new _RVAR(this.MainC, null, value, getStore && getStore(area.env), rvarName);
                                        else
                                            range.value.V = value;
                                    else
                                        range.value = value;
                                }
                                newVar(area.env)(range.value);
                                await subBuilder.call(this, subArea);
                            };
                        }
                        break;
                    case 'if':
                    case 'case':
                        {
                            const bHiding = CBool(atts.get('hiding')), caseList = [], getVal = this.CompAttrExpr(atts, 'value'), getCond = (srcElm.nodeName == 'IF') && this.CompAttrExpr(atts, 'cond', !getVal);
                            atts.CheckNoAttsLeft();
                            const bodyNodes = [], bTrimLeft = this.whiteSpc;
                            for (const child of srcElm.childNodes) {
                                if (child.nodeType == Node.ELEMENT_NODE) {
                                    const childElm = child, atts = new Atts(childElm), saved = this.SaveContext();
                                    this.whiteSpc = bTrimLeft;
                                    try {
                                        let cond;
                                        let patt;
                                        switch (child.nodeName) {
                                            case 'WHEN':
                                                cond = this.CompAttrExpr(atts, 'cond');
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
                                                const builder = this.CompChildNodes(childElm);
                                                caseList.push({ cond, patt, builder, childElm });
                                                atts.CheckNoAttsLeft();
                                                continue;
                                        }
                                    }
                                    catch (err) {
                                        throw OuterOpenTag(childElm) + err;
                                    }
                                    finally {
                                        this.RestoreContext(saved);
                                    }
                                }
                                bodyNodes.push(child);
                            }
                            if (getCond)
                                caseList.unshift({
                                    cond: getCond, patt: null,
                                    builder: this.CompChildNodes(srcElm, bodyNodes),
                                    childElm: srcElm
                                });
                            builder =
                                async function CASE(area) {
                                    const { env } = area, value = getVal && getVal(env);
                                    let choosenAlt = null;
                                    let matchResult;
                                    for (const alt of caseList)
                                        try {
                                            if ((!alt.cond || alt.cond(env))
                                                && (!alt.patt || (matchResult = alt.patt.regex.exec(value)))) {
                                                choosenAlt = alt;
                                                break;
                                            }
                                        }
                                        catch (err) {
                                            throw OuterOpenTag(alt.childElm) + err;
                                        }
                                    if (bHiding) {
                                        for (const alt of caseList) {
                                            const { elmRange, childArea, bInit } = PrepareElement(alt.childElm, area);
                                            const bHidden = elmRange.node.hidden = alt != choosenAlt;
                                            if ((!bHidden || bInit) && !area.bNoChildBuilding)
                                                await this.CallWithErrorHandling(alt.builder, alt.childElm, childArea);
                                        }
                                    }
                                    else {
                                        const { subArea, bInit } = PrepareArea(srcElm, area, '', 1, choosenAlt);
                                        if (choosenAlt && (bInit || !area.bNoChildBuilding)) {
                                            const saved = SaveEnv();
                                            try {
                                                if (choosenAlt.patt) {
                                                    let i = 1;
                                                    for (const lvar of choosenAlt.patt.lvars)
                                                        lvar(env)((choosenAlt.patt.url ? decodeURIComponent : (r) => r)(matchResult[i++]));
                                                }
                                                await this.CallWithErrorHandling(choosenAlt.builder, choosenAlt.childElm, subArea);
                                            }
                                            finally {
                                                RestoreEnv(saved);
                                            }
                                        }
                                    }
                                };
                            if (this.whiteSpc == WhiteSpace.trim)
                                this.whiteSpc = WhiteSpace.keep;
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
                            C.Settings.bRunScripts = true;
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
                        }
                        break;
                    case 'react':
                        {
                            this.MainC.bHasReacts = true;
                            const getRvars = this.compAttrExprList(atts, 'on');
                            const getHashes = this.compAttrExprList(atts, 'hash');
                            const bodyBuilder = this.CompChildNodes(srcElm);
                            builder = this.GetREACT(srcElm, '', bodyBuilder, getRvars, CBool(atts.get('renew')));
                            if (getHashes) {
                                const b = builder;
                                builder = async function HASH(area) {
                                    const { subArea, range } = PrepareArea(srcElm, area, 'hash');
                                    const hashes = getHashes(area.env);
                                    if (!range.value || hashes.some((hash, i) => hash !== range.value[i])) {
                                        range.value = hashes;
                                        await b.call(this, subArea);
                                    }
                                };
                            }
                        }
                        break;
                    case 'rhtml':
                        {
                            this.whiteSpc = WhiteSpace.trim;
                            const bodyBuilder = this.CompChildNodes(srcElm);
                            const modifs = this.CompAttributes(atts);
                            builder = async function RHTML(area) {
                                const tempElm = document.createElement('rhtml');
                                await bodyBuilder.call(this, { parent: tempElm, env: area.env, range: null });
                                const result = tempElm.innerText;
                                const { elmRange, bInit } = PrepareElement(srcElm, area, 'rhtml-rhtml'), elm = elmRange.node;
                                ApplyModifiers(elm, modifs, area.env, bInit);
                                if (area.prevR || result != elmRange.result) {
                                    elmRange.result = result;
                                    const shadowRoot = elm.shadowRoot || elm.attachShadow({ mode: 'open' });
                                    try {
                                        tempElm.innerHTML = result;
                                        if (elmRange.hdrElms) {
                                            for (const elm of elmRange.hdrElms)
                                                elm.remove();
                                            elmRange.hdrElms = null;
                                        }
                                        const R = new RCompiler();
                                        ;
                                        (R.StyleRoot = shadowRoot).innerHTML = '';
                                        R.Compile(tempElm, { bRunScripts: true }, false);
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
                        break;
                    case 'style':
                        this.CompStyle(srcElm);
                        break;
                    case 'component':
                        builder = this.CompComponent(srcParent, srcElm, atts);
                        break;
                    default:
                        builder = this.CompHTMLElement(srcElm, atts);
                        break labelNoCheck;
                }
                atts.CheckNoAttsLeft();
            }
        }
        catch (err) {
            throw `${OuterOpenTag(srcElm)} ${err}`;
        }
        if (genMods.length) {
            const b = builder;
            builder = async function ON(area) {
                const bInit = !area.range, handlers = genMods.map(({ attName, handler }) => ({ attName, handler: handler(area.env) }));
                const node = await b.call(this, area);
                for (const { attName, handler } of handlers)
                    if (bInit || attName == 'onupdate')
                        handler.call(node);
            };
        }
        for (const { attName, rvars } of reacts)
            builder = this.GetREACT(srcElm, attName, builder, rvars);
        if (builder)
            return [builder, srcElm];
        return null;
    }
    GetREACT(srcElm, attName, builder, getRvars, bRenew = false) {
        this.MainC.bHasReacts = true;
        const updateBuilder = (bRenew
            ? async function renew(subArea) {
                const subsubArea = PrepareArea(srcElm, subArea, 'renew', 2).subArea;
                await builder.call(this, subsubArea);
            }
            : attName == 'thisreactson'
                ? async function reacton(subArea) {
                    subArea.bNoChildBuilding = true;
                    await builder.call(this, subArea);
                }
                : builder);
        return async function REACT(area) {
            const { range, subArea, bInit } = PrepareArea(srcElm, area, attName, true);
            if (bRenew) {
                const subsubArea = PrepareArea(srcElm, subArea, 'renew', 2).subArea;
                await builder.call(this, subsubArea);
            }
            else
                await builder.call(this, subArea);
            if (getRvars)
                if (bInit) {
                    const subscriber = range.value = this.Subscriber(subArea, updateBuilder, range.child);
                    for (const rvar of getRvars(area.env))
                        try {
                            rvar.Subscribe(subscriber);
                        }
                        catch {
                            throw "This is not an RVAR";
                        }
                }
                else
                    range.value.sArea.env = CloneEnv(subArea.env);
        };
    }
    async CallWithErrorHandling(builder, srcNode, area) {
        let { range } = area;
        if (range && range.errorNode) {
            area.parent.removeChild(range.errorNode);
            range.errorNode = undefined;
        }
        try {
            await builder.call(this, area);
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
        const varName = atts.get('let');
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
                    const { range, subArea } = PrepareArea(srcElm, area, '', true), { parent, env } = subArea, savedEnv = SaveEnv();
                    try {
                        const keyMap = range.value ||= new Map(), newMap = new Map(), setVar = initVar(env), iterable = getRange(env), setIndex = initIndex(env);
                        if (iterable) {
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
                                newMap.set(key ?? {}, { item, hash, index: idx });
                                idx++;
                            }
                        }
                        let nextChild = range.child;
                        function RemoveStaleItems() {
                        }
                        const setPrevious = initPrevious(env), setNext = initNext(env), iterator = newMap.entries(), nextIterator = nextName ? newMap.values() : null;
                        let prevItem = null, nextItem, prevRange = null, childArea;
                        subArea.parentR = range;
                        if (nextIterator)
                            nextIterator.next();
                        while (true) {
                            let k;
                            while (nextChild && !newMap.has(k = nextChild.key)) {
                                if (k != null)
                                    keyMap.delete(k);
                                try {
                                    for (const node of nextChild.Nodes())
                                        parent.removeChild(node);
                                }
                                catch { }
                                nextChild.prev = null;
                                nextChild = nextChild.next;
                            }
                            const { value } = iterator.next();
                            if (!value)
                                break;
                            const [key, { item, hash, index }] = value;
                            if (nextIterator)
                                nextItem = nextIterator.next().value?.item;
                            let childRange = keyMap.get(key), bInit = !childRange;
                            if (bInit) {
                                subArea.range = null;
                                subArea.prevR = prevRange;
                                subArea.before = nextChild?.First || range.endMark;
                                ;
                                ({ range: childRange, subArea: childArea } = PrepareArea(null, subArea, `${varName}(${index})`, true));
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
                                            const nextIndex = newMap.get(nextChild.key)?.index;
                                            if (nextIndex > index + 2) {
                                                const fragm = nextChild.fragm = document.createDocumentFragment();
                                                for (const node of nextChild.Nodes())
                                                    fragm.appendChild(node);
                                                nextChild = nextChild.next;
                                                RemoveStaleItems();
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
                                childRange.text = `${varName}(${index})`;
                                if (prevRange)
                                    prevRange.next = childRange;
                                else
                                    range.child = childRange;
                                subArea.range = childRange;
                                childArea = PrepareArea(null, subArea, '', true).subArea;
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
                                        childRange.rvar = rvar;
                                    }
                                }
                                setVar(rvar || item);
                                setIndex(index);
                                setPrevious(prevItem);
                                if (nextIterator)
                                    setNext(nextItem);
                                await bodyBuilder.call(this, childArea);
                                if (bReactive)
                                    rvar.Subscribe(this.Subscriber(childArea, bodyBuilder, childRange.child));
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
                    const { subArea } = PrepareArea(srcElm, area);
                    const env = subArea.env;
                    const saved = SaveEnv();
                    const slotDef = env.constructs.get(slotName);
                    try {
                        const setIndex = initIndex(area.env);
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
    ParseSignature(elmSignature) {
        const signature = new Signature(elmSignature);
        for (const attr of elmSignature.attributes) {
            if (signature.RestParam)
                throw `Rest parameter must be the last`;
            const m = /^(#|\.\.\.)?(.*?)(\?)?$/.exec(attr.name);
            if (m[1] == '...')
                signature.RestParam = { name: m[2], pDefault: undefined };
            else
                signature.Parameters.push({ name: m[2],
                    pDefault: attr.value != ''
                        ? (m[1] == '#' ? this.CompJavaScript(attr.value, attr.name) : this.CompString(attr.value, attr.name))
                        : m[3] ? (_) => undefined
                            : null
                });
        }
        for (const elmSlot of elmSignature.children)
            signature.Slots.set(elmSlot.localName, this.ParseSignature(elmSlot));
        return signature;
    }
    CompComponent(srcParent, srcElm, atts) {
        const builders = [], bEncaps = CBool(atts.get('encapsulate')), styles = [], saveWS = this.whiteSpc;
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
                        throw `Illegal component element <${srcChild.nodeName}>`;
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
        if (bEncaps && !signature.RestParam)
            signature.RestParam = { name: null, pDefault: null };
        this.AddConstruct(signature);
        const { name } = signature, templates = [
            this.CompTemplate(signature, elmTemplate.content, elmTemplate, false, bEncaps, styles)
        ];
        this.whiteSpc = saveWS;
        return async function COMPONENT(area) {
            for (const [bldr, srcNode] of builders)
                await this.CallWithErrorHandling(bldr, srcNode, area);
            const construct = { templates, constructEnv: undefined };
            DefConstruct(area.env, name, construct);
            construct.constructEnv = CloneEnv(area.env);
        };
    }
    CompTemplate(signat, contentNode, srcElm, bNewNames, bEncaps, styles, atts) {
        const names = [], saved = this.SaveContext(), bCheckAtts = !atts;
        try {
            if (bCheckAtts)
                atts = new Atts(srcElm);
            for (const param of signat.Parameters)
                names.push((atts.get(`#${param.name}`) ?? atts.get(param.name, bNewNames)) || param.name);
            const { name, RestParam } = signat;
            if (RestParam?.name)
                names.push(atts.get(`...${RestParam.name}`, bNewNames) || RestParam.name);
            for (const S of signat.Slots.values())
                this.AddConstruct(S);
            if (bCheckAtts)
                atts.CheckNoAttsLeft();
            const lvars = names.map(name => this.NewVar(name)), builder = this.CompChildNodes(contentNode), customName = /^[A-Z].*-/.test(name) ? name : `rhtml-${name}`;
            return async function TEMPLATE(area, args, mSlotTemplates, slotEnv) {
                const saved = SaveEnv(), { env } = area;
                try {
                    for (const [slotName, instanceBuilders] of mSlotTemplates)
                        DefConstruct(env, slotName, { templates: instanceBuilders, constructEnv: slotEnv });
                    let i = 0;
                    for (const lvar of lvars) {
                        let arg = args[i], dflt;
                        if (arg === undefined && (dflt = signat.Parameters[i].pDefault))
                            arg = dflt(env);
                        lvar(env)(arg);
                        i++;
                    }
                    if (bEncaps) {
                        const { elmRange, childArea, bInit } = PrepareElement(srcElm, area, customName), elm = elmRange.node, shadow = elm.shadowRoot || elm.attachShadow({ mode: 'open' });
                        if (bInit)
                            for (const style of styles)
                                shadow.appendChild(style.cloneNode(true));
                        if (args[i])
                            ApplyModifier(elm, ModifType.RestArgument, null, args[i], bInit);
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
    CompInstance(srcParent, srcElm, atts, signature) {
        const { name } = signature, getArgs = [], slotBuilders = new Map();
        for (const { name, pDefault } of signature.Parameters)
            getArgs.push(this.CompParameter(atts, name, !pDefault));
        for (const name of signature.Slots.keys())
            slotBuilders.set(name, []);
        let slotElm, Slot;
        for (const node of Array.from(srcElm.childNodes))
            if (node.nodeType == Node.ELEMENT_NODE
                && (Slot = signature.Slots.get((slotElm = node).localName))
                && slotElm.localName != 'content') {
                slotBuilders.get(slotElm.localName).push(this.CompTemplate(Slot, slotElm, slotElm, true));
                srcElm.removeChild(node);
            }
        const contentSlot = signature.Slots.get('content');
        if (contentSlot)
            slotBuilders.get('content').push(this.CompTemplate(contentSlot, srcElm, srcElm, true, false, null, atts));
        const modifs = signature.RestParam ? this.CompAttributes(atts) : null;
        atts.CheckNoAttsLeft();
        this.whiteSpc = WhiteSpace.keep;
        return async function INSTANCE(area) {
            const { subArea } = PrepareArea(srcElm, area), { env } = area, { templates: instanceBuilders, constructEnv } = env.constructs.get(name), args = [];
            for (const getArg of getArgs)
                args.push(getArg ? getArg(env) : undefined);
            if (signature.RestParam) {
                const rest = [];
                for (const { modType, name, depValue } of modifs)
                    rest.push({ modType, name, value: depValue(env) });
                args.push(rest);
            }
            subArea.env = constructEnv;
            for (const parBuilder of instanceBuilders)
                await parBuilder.call(this, subArea, args, slotBuilders, env);
        };
    }
    static regTrimmable = /^(body|blockquote|d[dlt]|div|form|h\d|hr|li|ol|p|table|t[rhd]|ul)$/;
    CompHTMLElement(srcElm, atts) {
        const name = srcElm.localName.replace(/\.+$/, ''), saveWs = this.whiteSpc;
        const ws = name == 'pre' ? WhiteSpace.preserve : RCompiler.regTrimmable.test(name) ? WhiteSpace.trim : WhiteSpace.keep;
        const modifs = this.CompAttributes(atts);
        if (ws != WhiteSpace.keep)
            this.whiteSpc = ws;
        const childnodesBuilder = this.CompChildNodes(srcElm);
        if (ws == WhiteSpace.trim)
            this.whiteSpc = ws;
        else if (ws == WhiteSpace.preserve && saveWs != WhiteSpace.preserve)
            this.whiteSpc = WhiteSpace.keep;
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
            return node;
        };
        builder.ws = ws;
        return builder;
    }
    CompAttributes(atts) {
        const modifs = [];
        for (const [attName, attValue] of atts) {
            let m;
            try {
                if (m = /^on(.*)$/i.exec(attName))
                    modifs.push({
                        modType: ModifType.Event,
                        name: CapitalizeProp(m[0]),
                        depValue: this.CompHandler(attName, attValue)
                    });
                else if (m = /^#class:(.*)$/.exec(attName))
                    modifs.push({
                        modType: ModifType.Class, name: m[1],
                        depValue: this.CompJavaScript(attValue, attName)
                    });
                else if (m = /^#style\.(.*)$/.exec(attName))
                    modifs.push({
                        modType: ModifType.Style, name: CapitalizeProp(m[1]),
                        depValue: this.CompJavaScript(attValue, attName)
                    });
                else if (m = /^style\.(.*)$/.exec(attName))
                    modifs.push({
                        modType: ModifType.Style, name: CapitalizeProp(m[1]),
                        depValue: this.CompString(attValue)
                    });
                else if (attName == '+style')
                    modifs.push({
                        modType: ModifType.AddToStyle, name: null,
                        depValue: this.CompJavaScript(attValue, attName)
                    });
                else if (m = /^#(.*)/.exec(attName))
                    modifs.push({
                        modType: ModifType.Prop,
                        name: CapitalizeProp(m[1]),
                        depValue: this.CompJavaScript(attValue, attName)
                    });
                else if (attName == "+class")
                    modifs.push({
                        modType: ModifType.AddToClassList, name: null,
                        depValue: this.CompJavaScript(attValue, attName)
                    });
                else if (m = /^([*@])(\1)?(.*)$/.exec(attName)) {
                    const propName = CapitalizeProp(m[3]);
                    try {
                        const setter = this.CompJavaScript(`function(){const ORx=this.${propName};if(${attValue}!==ORx)${attValue}=ORx}`, attName);
                        modifs.push(m[1] == '@'
                            ? { modType: ModifType.Prop, name: propName, depValue: this.CompJavaScript(attValue, attName) }
                            : { modType: ModifType.oncreate, name: 'oncreate', depValue: setter });
                        modifs.push({ modType: ModifType.Event, name: m[2] ? 'onchange' : 'oninput', depValue: setter });
                    }
                    catch (err) {
                        throw `Invalid left-hand side '${attValue}'`;
                    }
                }
                else if (m = /^\.\.\.(.*)/.exec(attName)) {
                    if (attValue)
                        throw `Rest parameter cannot have a value`;
                    modifs.push({
                        modType: ModifType.RestArgument, name: null,
                        depValue: this.CompName(m[1])
                    });
                }
                else if (attName == 'src')
                    modifs.push({
                        modType: ModifType.Src,
                        name: this.FilePath,
                        depValue: this.CompString(attValue),
                    });
                else
                    modifs.push({
                        modType: ModifType.Attr,
                        name: attName,
                        depValue: this.CompString(attValue)
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
        this.StyleRoot.appendChild(srcStyle);
        this.AddedHeaderElements.push(srcStyle);
    }
    CompString(data, name) {
        const generators = [], regIS = /(?<![\\$])\$?\{((\{(\{.*?\}|.)*?\}|'.*?'|".*?"|`.*?`|.)*?)(?<!\\)\}|$/gs;
        let isTrivial = true, last = '', bThis = false;
        while (regIS.lastIndex < data.length) {
            const lastIndex = regIS.lastIndex, m = regIS.exec(data), fixed = lastIndex < m.index ? data.substring(lastIndex, m.index) : null;
            if (fixed)
                generators.push(last = fixed.replace(/\\([${}\\])/g, '$1'));
            if (m[1]) {
                const getS = this.CompJavaScript(m[1], name, '{}');
                generators.push(getS);
                isTrivial = false;
                last = '';
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
            dep = true ?
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
        dep.last = last;
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
    CompParameter(atts, attName, bRequired) {
        const value = atts.get(attName);
        return (value == null ? this.CompAttrExpr(atts, attName, bRequired)
            : /^on/.test(attName) ? this.CompHandler(attName, value)
                : this.CompString(value, attName));
    }
    CompAttrExpr(atts, attName, bRequired) {
        return this.CompJavaScript(atts.get(attName, bRequired, true), attName);
    }
    CompHandler(name, text) {
        return this.CompJavaScript(`function ${name}(event){${text}\n}`, name);
    }
    CompJavaScript(expr, descript, delims = '""') {
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
    compAttrExprList(atts, attName, bRequired) {
        const list = atts.get(attName, bRequired, true);
        return list ? this.CompJavaScript(`[${list}\n]`, attName) : null;
    }
    GetURL(src) {
        return new URL(src, this.FilePath).href;
    }
    GetPath(src) {
        return this.GetURL(src).replace(/[^/]*$/, '');
    }
    async FetchText(src) {
        const url = this.GetURL(src), response = await gFetch(url);
        if (!response.ok)
            throw `GET '${url}' returned ${response.status} ${response.statusText}`;
        return await response.text();
    }
}
<<<<<<< HEAD
RCompiler.iNum = 0;
RCompiler.genAtts = ['reacton', 'reactson', 'thisreactson', 'oncreate', 'onupdate'];
RCompiler.regTrimmable = /^(body|blockquote|d[dlt]|div|form|h\d|hr|li|ol|p|table|t[rhd]|ul|select)$/;
=======
>>>>>>> 0efe2af619161695d79ec2dca5534e98333e19cc
function quoteReg(fixed) {
    return fixed.replace(/[.()?*+^$\\]/g, s => `\\${s}`);
}
export class _RVAR {
    MainC;
    store;
    storeName;
    constructor(MainC, globalName, initialValue, store, storeName) {
        this.MainC = MainC;
        this.store = store;
        this.storeName = storeName;
        if (globalName)
            globalThis[globalName] = this;
        let s;
        if ((s = store && store.getItem(`RVAR_${storeName}`)) != null)
            try {
                this._Value = JSON.parse(s);
                return;
            }
            catch { }
        this._Value = initialValue;
        this.storeName ||= globalName;
    }
    _Value;
    Subscribers = new Set();
    Subscribe(s) {
        if (!s.ref)
            s.ref = { isConnected: true };
        this.Subscribers.add(s);
    }
    get V() { return this._Value; }
    set V(t) {
        if (t !== this._Value) {
            this._Value = t;
            this.SetDirty();
        }
    }
    get U() {
        if (!bReadOnly)
            this.SetDirty();
        return this._Value;
    }
    set U(t) { this.V = t; }
    SetDirty() {
        if (this.store)
            this.MainC.DirtyVars.add(this);
        for (const sub of this.Subscribers)
            if (sub.ref.isConnected)
                this.MainC.AddDirty(sub);
            else
                this.Subscribers.delete(sub);
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
    + '|clip|(?:col|row)(?=span)|column|content|element|feature|fill|first|font|get|grid|image|inner|^is|last|left|line|margin|max|min|node|offset|outer'
    + '|outline|overflow|owner|padding|parent|read|right|size|rule|scroll|selected|table|tab(?=index)|text|top|value|variant)';
const regCapitalize = new RegExp(`html|uri|(?<=${words})[a-z]`, "g");
function CapitalizeProp(lcName) {
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
export let RHTML = new RCompiler();
Object.defineProperties(globalThis, {
    RVAR: { get: () => RHTML.RVAR.bind(RHTML) },
    RUpdate: { get: () => RHTML.RUpdate.bind(RHTML) },
});
globalThis.RCompile = RCompile;
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
function SetLocation() {
    docLocation.V = location.href;
}
docLocation.Subscribe({ updater: async () => {
        if (docLocation.V != location.href)
            history.pushState(null, null, docLocation.V);
    } });
window.addEventListener('popstate', SetLocation);
export const reroute = globalThis.reroute = (arg) => {
    docLocation.V = typeof arg == 'string' ? arg : arg.target.href;
    return false;
};
