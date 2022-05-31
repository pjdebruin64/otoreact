let defaultSettings = {
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
}, parser = new DOMParser(), gEval = eval, gFetch = fetch, u = undefined;
class Range {
    constructor(node, area, text) {
        this.node = node;
        this.text = text;
        this.next = null;
        if (!node)
            this.child = null;
        if (area && !area.parentR?.node)
            this.parentR = area.parentR;
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
    }
    get Next() {
        let r = this, n, p;
        do {
            p = r.parentR;
            while (r = r.next)
                if (n = r.First)
                    return n;
        } while (r = p);
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
let dU = () => u;
function PrepArea(srcElm, area, text = '', nWipe, result) {
    let { parent, range } = area, subArea = { parent, range: null }, bInit = !range;
    if (bInit) {
        subArea.source = area.source;
        subArea.before = area.before;
        if (srcElm)
            text = srcElm.localName + (text && ' ') + text;
        UpdPrevRange(area, range = subArea.parentR = new Range(null, area, text));
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
function UpdPrevRange(area, range) {
    let r;
    if (r = area.prevR)
        r.next = range;
    else if (r = area.parentR)
        r.child = range;
    area.prevR = range;
}
function PrepElm(srcElm, area, nodeName = srcElm.nodeName) {
    let range = area.range, bInit = !range;
    if (bInit) {
        range = new Range(area.source == srcElm
            ? (srcElm.innerHTML = "", srcElm)
            : area.parent.insertBefore(document.createElement(nodeName), area.before), area);
        UpdPrevRange(area, range);
    }
    else
        area.range = range.next;
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
    if (!range)
        UpdPrevRange(area, new Range(area.parent.insertBefore(bComm ? document.createComment(content) : document.createTextNode(content), area.before), area));
    else {
        range.node.data = content;
        area.range = range.next;
    }
}
let ToBuild = [];
export async function RCompile(elm, settings) {
    try {
        let { basePattern } = R.Settings = { ...defaultSettings, ...settings }, m = location.href.match(`^.*(${basePattern})`);
        R.FilePath = location.origin + (docLocation.basepath = m ? (new URL(m[0])).pathname.replace(/[^/]*$/, '') : '');
        R.RootElm = elm;
        await R.Compile(elm, {}, true);
        ToBuild.push({ parent: elm.parentElement, source: elm, range: null });
        if (R.Settings.bBuild)
            await RBuild();
    }
    catch (err) {
        window.alert(`OtoReact error: ` + err);
    }
}
export async function RBuild() {
    R.start = performance.now();
    builtNodeCnt = 0;
    try {
        for (let area of ToBuild)
            await R.Build(area);
        R.logTime(`${R.num}: Built ${builtNodeCnt} nodes in ${(performance.now() - R.start).toFixed(1)} ms`);
        ScrollToHash();
    }
    catch (err) {
        window.alert(`OtoReact error: ` + err);
    }
    ToBuild = [];
}
function NewEnv() {
    let e = [];
    e.constructs = new Map();
    return e;
}
function CloneEnv(env) {
    let e = Object.assign(new Array(), env);
    e.constructs = new Map(env.constructs.entries());
    return e;
}
function assignEnv(target, source) {
    let C = target.constructs;
    Object.assign(target, source)
        .constructs = C;
}
class Signature {
    constructor(srcElm) {
        this.srcElm = srcElm;
        this.Params = [];
        this.RestParam = null;
        this.Slots = new Map();
        this.nm = srcElm.localName;
    }
    IsCompatible(sig) {
        if (!sig)
            return false;
        let r = true, mapSigParams = new Map(sig.Params.map(p => [p.nm, p.pDflt]));
        for (let { nm, pDflt } of this.Params)
            if (mapSigParams.has(nm)) {
                r && (r = !pDflt || mapSigParams.get(nm));
                mapSigParams.delete(nm);
            }
            else
                r = false;
        for (let pDflt of mapSigParams.values())
            r && (r = pDflt);
        for (let [nm, slotSig] of this.Slots)
            r && (r = sig.Slots.get(nm)?.IsCompatible(slotSig));
        return r;
    }
}
let bReadOnly = 0;
function ApplyMod(elm, mt, nm, val, bCreate) {
    switch (mt) {
        case 0:
            elm.setAttribute(nm, val);
            break;
        case 2:
            elm.setAttribute('src', new URL(val, nm).href);
            break;
        case 1:
            if (val === u && typeof elm[nm] == 'string')
                val = '';
            if (val !== elm[nm])
                elm[nm] = val;
            break;
        case 5:
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
        case 3:
            if (val)
                elm.classList.add(nm);
            break;
        case 4:
            elm.style[nm] = val || (val === 0 ? '0' : null);
            break;
        case 6:
            if (val)
                for (let [nm, v] of Object.entries(val))
                    elm.style[nm] = v || (v === 0 ? '0' : null);
            break;
        case 7:
            (function a(v) {
                if (v)
                    switch (typeof v) {
                        case 'string':
                            elm.classList.add(v);
                            break;
                        case 'object':
                            if (v)
                                if (Array.isArray(v))
                                    v.forEach(a);
                                else
                                    for (let [nm, b] of Object.entries(v))
                                        if (b)
                                            a(nm);
                            break;
                        default: throw `Invalid value`;
                    }
            })(val);
            break;
        case 8:
            for (let { mt, nm, value } of val || [])
                ApplyMod(elm, mt, nm, value, bCreate);
            break;
        case 9:
            if (bCreate)
                val.call(elm);
        case 10:
            if (!bCreate)
                val.call(elm);
            break;
    }
}
function ApplyMods(elm, modifiers, bCreate) {
    bReadOnly = 1;
    for (let { mt, nm, depV } of modifiers)
        try {
            let value = depV.bThis ? depV.call(elm) : depV();
            ApplyMod(elm, mt, nm, value, bCreate);
        }
        catch (err) {
            throw `[${nm}]: ${err}`;
        }
    bReadOnly = 0;
}
let RModules = new Map(), env, onerr, onsucc, builtNodeCnt = 0, envActions = [];
function SaveEnv() {
    return envActions.length;
}
function RestoreEnv(savedEnv) {
    for (let j = envActions.length; j > savedEnv; j--)
        envActions.pop()();
}
function DefConstruct(C) {
    let { constructs } = env, prevDef = constructs.get(C.nm);
    mapNm(constructs, C);
    envActions.push(() => mapSet(constructs, C.nm, prevDef));
}
let updCnt = 0;
class RCompiler {
    constructor(RC) {
        this.num = RCompiler.iNum++;
        this.cRvars = new Map();
        this.restoreActions = [];
        this.mPreformatted = new Set(['pre']);
        this.AllAreas = [];
        this.bCompiled = false;
        this.wspc = 1;
        this.rspc = 1;
        this.DirtyVars = new Set();
        this.DirtySubs = new Map();
        this.bUpdating = false;
        this.bUpdate = false;
        this.handleUpdate = null;
        this.sourceNodeCount = 0;
        this.context = RC?.context || "";
        this.ContextMap = RC ? new Map(RC.ContextMap) : new Map();
        this.CSignatures = RC ? new Map(RC.CSignatures) : new Map();
        this.Settings = RC ? { ...RC.Settings } : { ...defaultSettings };
        this.RC = RC || (RC = this);
        this.AddedHdrElms = RC.AddedHdrElms || [];
        this.head = RC.head || document.head;
        this.StyleBefore = RC.StyleBefore;
        this.FilePath = RC.FilePath;
    }
    SaveCont() {
        return this.restoreActions.length;
    }
    RestoreCont(sv) {
        for (let j = this.restoreActions.length; j > sv; j--)
            this.restoreActions.pop()();
    }
    NewVar(nm) {
        let init;
        if (!nm)
            init = (() => (_) => { });
        else {
            nm = CheckIdentifier(nm);
            let i = this.ContextMap.get(nm);
            if (i == null) {
                let prevCont = this.context;
                i = this.ContextMap.size;
                this.ContextMap.set(nm, i);
                this.context += `${nm},`;
                this.restoreActions.push(() => {
                    this.ContextMap.delete(nm);
                    this.context = prevCont;
                });
                init = (() => {
                    envActions.push(() => { env.length = i; });
                    return (v) => { env[i] = v; };
                });
            }
            else
                init = (() => {
                    let prev = env[i];
                    envActions.push(() => { env[i] = prev; });
                    return (v) => { env[i] = v; };
                });
        }
        init.nm = nm;
        return init;
    }
    NewVars(varlist) {
        return (varlist
            ? varlist.split(',')
                .map(nm => this.NewVar(nm))
            : []);
    }
    AddConstruct(S) {
        let savedC = this.CSignatures.get(S.nm);
        mapNm(this.CSignatures, S);
        this.restoreActions.push(() => mapSet(this.CSignatures, S.nm, savedC));
    }
    async Compile(elm, settings = {}, bIncludeSelf = false) {
        let t0 = performance.now(), savedR = R;
        Object.assign(this.Settings, settings);
        for (let tag of this.Settings.preformatted)
            this.mPreformatted.add(tag.toLowerCase());
        try {
            R = this;
            this.Builder =
                bIncludeSelf
                    ? (await this.CompElm(elm.parentElement, elm, true))[0]
                    : await this.CompChildNodes(elm);
            this.bCompiled = true;
        }
        finally {
            R = savedR;
        }
        this.logTime(`Compiled ${this.sourceNodeCount} nodes in ${(performance.now() - t0).toFixed(1)} ms`);
    }
    logTime(msg) {
        if (this.Settings.bTiming)
            console.log(msg);
    }
    Subscriber({ parent, bRootOnly }, builder, range, ...args) {
        if (range)
            range.updated = updCnt;
        let sArea = {
            parent, bRootOnly,
            range,
        }, subEnv = { env: CloneEnv(env), onerr, onsucc }, subscriber = async () => {
            let { range } = sArea, save = { env, onerr, onsucc };
            if (!range.erased && (range.updated || 0) < updCnt) {
                ({ env, onerr, onsucc } = subEnv);
                range.updated = updCnt;
                builtNodeCnt++;
                try {
                    await builder.call(this, { ...sArea }, ...args);
                }
                finally {
                    ({ env, onerr, onsucc } = save);
                }
            }
        };
        subscriber.sArea = sArea;
        subscriber.ref = range;
        subscriber.env = subEnv.env;
        return subscriber;
    }
    async Build(area) {
        let saveR = R, { parentR } = area;
        R = this;
        env = NewEnv();
        builtNodeCnt++;
        await this.Builder(area);
        let subs = this.Subscriber(area, this.Builder, parentR?.child || area.prevR);
        this.AllAreas.push(subs);
        R = saveR;
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
    async DoUpdate() {
        if (!this.bCompiled || this.bUpdating) {
            this.bUpdate = true;
            return;
        }
        updCnt++;
        do {
            this.bUpdate = false;
            this.bUpdating = true;
            let saveR = R, subs = this.DirtySubs;
            try {
                for (let rvar of this.DirtyVars)
                    rvar.Save();
                this.DirtyVars.clear();
                if (subs.size) {
                    R = this;
                    this.start = performance.now();
                    builtNodeCnt = 0;
                    this.DirtySubs = new Map();
                    for (let sub of subs.values())
                        try {
                            await sub();
                        }
                        catch (err) {
                            let msg = `ERROR: ` + err;
                            console.log(msg);
                            window.alert(msg);
                        }
                    this.logTime(`${R.num}: Updated ${builtNodeCnt} nodes in ${(performance.now() - this.start).toFixed(1)} ms`);
                }
            }
            finally {
                R = saveR;
                this.bUpdating = false;
            }
        } while (this.bUpdate);
    }
    RVAR(nm, value, store, subs, storeName) {
        let r = new _RVAR(this.RC, nm, value, store, storeName);
        if (subs)
            r.Subscribe(subs, true, false);
        return r;
    }
    RVAR_Light(t, updatesTo) {
        if (!t._Subscribers) {
            t._Subscribers = new Set();
            t._UpdatesTo = updatesTo;
            let { RC } = this;
            Object.defineProperty(t, 'U', { get: () => {
                    if (!bReadOnly) {
                        for (let sub of t._Subscribers)
                            RC.AddDirty(sub);
                        if (t._UpdatesTo?.length)
                            for (let rvar of t._UpdatesTo)
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
    async CompChildNodes(srcParent, childNodes = srcParent.childNodes) {
        let saved = this.SaveCont();
        try {
            let bldr = await this.CompIter(srcParent, childNodes);
            return bldr ?
                async function ChildNodes(area) {
                    let savEnv = SaveEnv();
                    try {
                        await bldr.call(this, area);
                    }
                    finally {
                        RestoreEnv(savEnv);
                    }
                }
                : async () => { };
        }
        finally {
            this.RestoreCont(saved);
        }
    }
    async CompIter(srcParent, iter) {
        let builders = [], { rspc } = this, arr = Array.from(iter), L = arr.length, i = 0;
        for (let srcNode of arr) {
            i++;
            this.rspc = i == L && rspc;
            let bldr;
            switch (srcNode.nodeType) {
                case Node.ELEMENT_NODE:
                    this.sourceNodeCount++;
                    bldr = await this.CompElm(srcParent, srcNode);
                    break;
                case Node.TEXT_NODE:
                    this.sourceNodeCount++;
                    let str = srcNode.nodeValue;
                    let getText = this.CompString(str), { fixed } = getText;
                    if (fixed !== '') {
                        bldr =
                            [fixed
                                    ? async (area) => PrepCharData(area, fixed)
                                    : async (area) => PrepCharData(area, getText()), srcNode,
                                fixed == ' '];
                        if (this.wspc < 4)
                            this.wspc = /\s$/.test(str) ? 2 : 3;
                    }
                    break;
                case Node.COMMENT_NODE:
                    if (this.Settings.bKeepComments) {
                        let getText = this.CompString(srcNode.nodeValue, 'Comment');
                        bldr =
                            [async (area) => PrepCharData(area, getText(), true), srcNode, 1];
                    }
                    break;
            }
            if (bldr ? bldr[0].ws : this.rspc)
                prune();
            if (bldr)
                builders.push(bldr);
        }
        function prune() {
            let i = builders.length, isB;
            while (i-- && (isB = builders[i][2]))
                if (isB === true)
                    builders.splice(i, 1);
        }
        if (rspc)
            prune();
        if (!builders.length)
            return null;
        let Iter = async function Iter(area, start = 0) {
            let i = 0, toSubscribe = [];
            if (!area.range) {
                for (let [bldr] of builders) {
                    i++;
                    await bldr.call(this, area);
                    if (bldr.auto)
                        toSubscribe.push(this.Subscriber(area, Iter, area.prevR, i));
                }
                for (let subs of toSubscribe) {
                    let { sArea } = subs, r = sArea.range, rvar = r.value;
                    if (!rvar._Subscribers.size && r.next) {
                        (sArea.range = r.next).updated = 0;
                        subs.ref = {};
                        rvar.Subscribe(rvar.auto = subs);
                    }
                }
            }
            else
                for (let [bldr] of builders)
                    if (i++ >= start) {
                        let r = area.range;
                        await bldr.call(this, area);
                        if (bldr.auto && r.value.auto)
                            assignEnv(r.value.auto.env, env);
                    }
            builtNodeCnt += builders.length - start;
        };
        Iter.ws = builders[0][0].ws;
        return Iter;
    }
    async CompElm(srcParent, srcElm, bUnhide) {
        let atts = new Atts(srcElm), reacts = [], genMods = [], depOnerr, depOnsucc, bldr, elmBldr, isBlank, m;
        if (bUnhide)
            atts.set('#hidden', 'false');
        try {
            for (let attNm of atts.keys())
                if (m = RCompiler.genAtts.exec(attNm))
                    if (m[1])
                        reacts.push({ attNm, rvars: this.compAttrExprList(atts, attNm, true) });
                    else if (m[2])
                        genMods.push({ attNm, text: atts.get(attNm), C: /c/.test(attNm), U: /u/.test(attNm) });
                    else {
                        let dep = this.CompHandler(attNm, atts.get(attNm));
                        if (m[3])
                            (depOnerr = dep).bBldr = !/-$/.test(attNm);
                        else
                            depOnsucc = dep;
                    }
            let constr = this.CSignatures.get(srcElm.localName);
            if (constr)
                bldr = await this.CompInstance(srcElm, atts, constr);
            else {
                switch (srcElm.localName) {
                    case 'def':
                    case 'define':
                        {
                            let rv;
                            [bldr, rv] = this.CompDefine(srcElm, atts);
                            if (rv) {
                                let a = this.cRvars.get(rv);
                                this.cRvars.set(rv, true);
                                this.restoreActions.push(() => {
                                    if (elmBldr)
                                        elmBldr.auto = this.cRvars.get(rv);
                                    this.cRvars.set(rv, a);
                                });
                            }
                            isBlank = 1;
                        }
                        break;
                    case 'if':
                    case 'case':
                        {
                            let bHiding = atts.getB('hiding'), getVal = this.CompAttrExpr(atts, 'value'), caseNodes = [], body = [], bThen = false;
                            for (let node of srcElm.childNodes) {
                                if (node.nodeType == Node.ELEMENT_NODE)
                                    switch (node.nodeName) {
                                        case 'THEN':
                                            bThen = true;
                                            new Atts(node).ChkNoAttsLeft();
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
                                    atts.ChkNoAttsLeft();
                            let caseList = [], { wspc, rspc } = this, postWs = 0, elseWs = wspc;
                            for (let { node, atts, body } of caseNodes) {
                                let saved = this.SaveCont();
                                this.wspc = wspc;
                                this.rspc = rspc;
                                try {
                                    let cond = null, not = false, patt = null, p;
                                    switch (node.nodeName) {
                                        case 'WHEN':
                                        case 'IF':
                                        case 'THEN':
                                            cond = this.CompAttrExpr(atts, 'cond');
                                            not = atts.getB('not') || false;
                                            patt =
                                                (p = atts.get('match')) != null
                                                    ? this.CompPattern(p)
                                                    : (p = atts.get('urlmatch')) != null
                                                        ? this.CompPattern(p, true)
                                                        : (p = atts.get('regmatch')) != null
                                                            ? { regex: new RegExp(p, 'i'),
                                                                lvars: (atts.get('captures')?.split(',') || []).map(this.NewVar.bind(this))
                                                            }
                                                            : null;
                                            if (bHiding && patt?.lvars.length)
                                                throw `Pattern capturing cannot be combined with hiding`;
                                            if (patt && !getVal)
                                                throw `Match requested but no 'value' specified.`;
                                        case 'ELSE':
                                            caseList.push({ cond, not, patt,
                                                builder: await this.CompChildNodes(node, body),
                                                node });
                                            atts.ChkNoAttsLeft();
                                            postWs = Math.max(postWs, this.wspc);
                                            if (not === u)
                                                elseWs = 0;
                                            continue;
                                    }
                                }
                                catch (err) {
                                    throw (node.nodeName == 'IF' ? '' : OuterOpenTag(node)) + err;
                                }
                                finally {
                                    this.RestoreCont(saved);
                                }
                            }
                            this.wspc = Math.max(postWs, elseWs);
                            bldr =
                                async function CASE(area) {
                                    let value = getVal && getVal(), choosenAlt = null, matchResult;
                                    for (let alt of caseList)
                                        try {
                                            if (!((!alt.cond || alt.cond())
                                                && (!alt.patt || value != null && (matchResult = alt.patt.regex.exec(value)))) == alt.not) {
                                                choosenAlt = alt;
                                                break;
                                            }
                                        }
                                        catch (err) {
                                            if (bHiding)
                                                for (let alt of caseList)
                                                    PrepElm(alt.node, area);
                                            else
                                                PrepArea(srcElm, area, '', 1, choosenAlt);
                                            throw (alt.node.nodeName == 'IF' ? '' : OuterOpenTag(alt.node)) + err;
                                        }
                                    if (bHiding) {
                                        for (let alt of caseList) {
                                            let { range, childArea, bInit } = PrepElm(alt.node, area);
                                            if ((!(range.node.hidden = alt != choosenAlt)
                                                || bInit)
                                                && !area.bRootOnly)
                                                await this.CallWithHandling(alt.builder, alt.node, childArea);
                                        }
                                    }
                                    else {
                                        let { subArea, bInit } = PrepArea(srcElm, area, '', 1, choosenAlt);
                                        if (choosenAlt && (bInit || !area.bRootOnly)) {
                                            let saved = SaveEnv(), i = 0;
                                            try {
                                                if (choosenAlt.patt)
                                                    for (let lvar of choosenAlt.patt.lvars)
                                                        lvar()((choosenAlt.patt.url ? decodeURIComponent : (r) => r)(matchResult[++i]));
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
                        bldr = await this.CompFor(srcParent, srcElm, atts);
                        break;
                    case 'include':
                        {
                            let src = atts.get('src', true), C = new RCompiler(this);
                            C.FilePath = this.GetPath(src);
                            let task = (async () => {
                                await C.Compile(parser.parseFromString(await this.FetchText(src), 'text/html').body, { bRunScripts: true }, false);
                            })();
                            bldr =
                                async function INCLUDE(area) {
                                    let t0 = performance.now();
                                    await task;
                                    this.start += performance.now() - t0;
                                    await C.Builder(area);
                                };
                        }
                        break;
                    case 'import':
                        {
                            let src = this.GetURL(atts.get('src', true)), bIncl = atts.getB('include'), vars = this.NewVars(atts.get('defines')), bAsync = atts.getB('async'), listImports = new Array(), promModule = RModules.get(src);
                            for (let child of srcElm.children) {
                                let sign = this.ParseSignat(child);
                                listImports.push(sign);
                                this.AddConstruct(sign);
                            }
                            if (!promModule) {
                                promModule = this.FetchText(src)
                                    .then(async (textContent) => {
                                    let parsedDoc = parser.parseFromString(textContent, 'text/html'), body = parsedDoc.body, C = new RCompiler(this);
                                    if (body.firstElementChild.tagName == 'MODULE')
                                        body = body.firstElementChild;
                                    C.FilePath = this.GetPath(src);
                                    C.Settings.bRunScripts = true;
                                    let bldr = await C.CompIter(null, concIterable(parsedDoc.head.children, body.children));
                                    for (let clientSig of listImports) {
                                        let signat = C.CSignatures.get(clientSig.nm);
                                        if (!signat)
                                            throw `<${clientSig.nm}> is missing in '${src}'`;
                                        if (bAsync && !clientSig.IsCompatible(signat))
                                            throw `Import signature ${clientSig.srcElm.outerHTML} is incompatible with module signature ${signat.srcElm.outerHTML}`;
                                    }
                                    for (let V of vars)
                                        if ((V.i = C.ContextMap.get(V.nm)) == u)
                                            throw `Module does not define '${V.nm}'`;
                                    return [bldr.bind(C), C.CSignatures];
                                });
                                RModules.set(src, promModule);
                            }
                            if (!bAsync) {
                                let prom = promModule.then(([_, CSigns]) => {
                                    for (let clientSig of listImports)
                                        Object.assign(clientSig, CSigns.get(clientSig.nm));
                                });
                                for (let clientSig of listImports)
                                    clientSig.prom = prom;
                            }
                            bldr = async function IMPORT(reg) {
                                let [bldr] = await promModule, saveEnv = env, MEnv = env = NewEnv();
                                await bldr(bIncl ? reg : { parent: document.createDocumentFragment() });
                                env = saveEnv;
                                for (let { nm } of listImports)
                                    DefConstruct(MEnv.constructs.get(nm));
                                for (let init of vars)
                                    init()(MEnv[init.i]);
                            };
                            isBlank = 1;
                        }
                        break;
                    case 'react':
                        {
                            let getRvars = this.compAttrExprList(atts, 'on', true), getHashes = this.compAttrExprList(atts, 'hash'), bodyBuilder = await this.CompChildNodes(srcElm);
                            bldr = this.GetREACT(srcElm, 'on', bodyBuilder, getRvars, atts.getB('renew'));
                            if (getHashes) {
                                let b = bldr;
                                bldr = async function HASH(area) {
                                    let { subArea, range } = PrepArea(srcElm, area, 'hash'), hashes = getHashes();
                                    if (!range.value || hashes.some((hash, i) => hash !== range.value[i])) {
                                        range.value = hashes;
                                        await b.call(this, subArea);
                                    }
                                };
                                bldr.ws = b.ws;
                            }
                        }
                        break;
                    case 'rhtml':
                        {
                            let getSrctext = this.CompParam(atts, 'srctext', true), modifs = this.CompAttribs(atts);
                            this.wspc = 1;
                            bldr = async function RHTML(area) {
                                let srctext = getSrctext(), { range, bInit } = PrepElm(srcElm, area, 'rhtml-rhtml'), { node } = range;
                                ApplyMods(node, modifs, bInit);
                                if (area.prevR || srctext != range.result) {
                                    range.result = srctext;
                                    let shadowRoot = node.shadowRoot || node.attachShadow({ mode: 'open' }), tempElm = document.createElement('rhtml'), svEnv = env, R = new RCompiler();
                                    try {
                                        tempElm.innerHTML = srctext;
                                        if (range.hdrElms) {
                                            for (let elm of range.hdrElms)
                                                elm.remove();
                                            range.hdrElms = null;
                                        }
                                        R.FilePath = this.FilePath;
                                        (R.head = shadowRoot).innerHTML = '';
                                        await R.Compile(tempElm, { bRunScripts: true, bTiming: this.Settings.bTiming }, false);
                                        range.hdrElms = R.AddedHdrElms;
                                        await R.Build({ parent: shadowRoot, range: null,
                                            parentR: new Range(null, null, 'Shadow') });
                                    }
                                    catch (err) {
                                        shadowRoot.appendChild(createErrNode(`Compile error: ` + err));
                                    }
                                    finally {
                                        env = svEnv;
                                    }
                                }
                            };
                        }
                        break;
                    case 'script':
                        bldr = await this.CompScript(srcParent, srcElm, atts);
                        isBlank = 1;
                        break;
                    case 'style':
                        this.CompStyle(srcElm);
                        isBlank = 1;
                        break;
                    case 'component':
                        bldr = await this.CompComponent(srcElm, atts);
                        isBlank = 1;
                        break;
                    case 'document':
                        {
                            let newVar = this.NewVar(atts.get('name', true)), RC = this, saved = this.SaveCont();
                            try {
                                let bEncaps = atts.getB('encapsulate'), setVars = this.NewVars(atts.get('params')), setWin = this.NewVar(atts.get('window')), docBuilder = await RC.CompChildNodes(srcElm), docDef = (docEnv) => {
                                    docEnv = CloneEnv(docEnv);
                                    return {
                                        async render(W, args) {
                                            let svEnv = env, i = 0;
                                            env = docEnv;
                                            for (let init of setVars)
                                                init()(args[i++]);
                                            setWin()(W);
                                            try {
                                                await docBuilder.call(RC, { parent: W.document.body });
                                            }
                                            finally {
                                                env = svEnv;
                                            }
                                        },
                                        open(target, features, ...args) {
                                            let W = window.open('', target, features);
                                            W.addEventListener('keydown', function (event) { if (event.key == 'Escape')
                                                this.close(); });
                                            if (!bEncaps)
                                                copyStyleSheets(document, W.document);
                                            this.render(W, args);
                                            return W;
                                        },
                                        async print(...args) {
                                            let iframe = document.createElement('iframe');
                                            iframe.setAttribute('style', 'display:none');
                                            document.body.appendChild(iframe);
                                            if (!bEncaps)
                                                copyStyleSheets(document, iframe.contentDocument);
                                            await this.render(iframe.contentWindow, args);
                                            iframe.contentWindow.print();
                                            iframe.remove();
                                        }
                                    };
                                };
                                bldr = async function DOCUMENT() {
                                    newVar()(docDef(env));
                                };
                                isBlank = 1;
                            }
                            finally {
                                this.RestoreCont(saved);
                            }
                        }
                        break;
                    case 'rhead':
                        {
                            let childBuilder = await this.CompChildNodes(srcElm), { wspc } = this;
                            this.wspc = this.rspc = 1;
                            bldr = async function HEAD(area) {
                                let sub = PrepArea(srcElm, area).subArea;
                                sub.parent = area.parent.ownerDocument.head;
                                await childBuilder.call(this, sub);
                            };
                            this.wspc = wspc;
                            isBlank = 1;
                        }
                        break;
                    default:
                        bldr = await this.CompHTMLElement(srcElm, atts);
                        break;
                }
                atts.ChkNoAttsLeft();
            }
            for (let g of genMods)
                g.hndlr = this.CompHandler(g.attNm, g.text);
        }
        catch (err) {
            throw OuterOpenTag(srcElm) + ' ' + err;
        }
        if (!bldr)
            return null;
        if (depOnerr || depOnsucc) {
            let b = bldr;
            bldr = async function SetOnError(area) {
                let save = { onerr, onsucc };
                try {
                    if (depOnerr)
                        (onerr = depOnerr()).bBldr = depOnerr.bBldr;
                    if (depOnsucc)
                        onsucc = depOnsucc();
                    await b.call(this, area);
                }
                finally {
                    ({ onerr, onsucc } = save);
                }
            };
        }
        if (genMods.length) {
            let b = bldr;
            bldr = async function ON(area) {
                let r = area.range;
                await b.call(this, area);
                for (let g of genMods)
                    if (r ? g.U : g.C)
                        g.hndlr().call((r ? r.node : area.prevR?.node)
                            || area.parent);
            };
        }
        for (let { attNm, rvars } of reacts)
            bldr = this.GetREACT(srcElm, attNm, bldr, rvars);
        elmBldr = function Elm(area) {
            return this.CallWithHandling(bldr, srcElm, area);
        };
        elmBldr.ws = bldr.ws;
        return [elmBldr, srcElm];
    }
    GetREACT(srcElm, attName, builder, getRvars, bRenew = false) {
        let updateBuilder = (bRenew
            ? function renew(subArea) {
                return builder.call(this, PrepArea(srcElm, subArea, 'renew', 2).subArea);
            }
            : /^this/.test(attName)
                ? function reacton(subArea) {
                    subArea.bRootOnly = true;
                    return builder.call(this, subArea);
                }
                : builder);
        async function REACT(area) {
            let range, subArea, bInit;
            ({ range, subArea, bInit } = PrepArea(srcElm, area, attName));
            area = subArea;
            if (bRenew)
                area = PrepArea(srcElm, area, 'renew', 2).subArea;
            await builder.call(this, area);
            if (getRvars) {
                let rvars = getRvars(), subscriber, pVars, i = 0;
                if (bInit)
                    subscriber = this.Subscriber(subArea, updateBuilder, range.child);
                else {
                    ({ subscriber, rvars: pVars } = range.value);
                    assignEnv(subscriber.env, env);
                }
                range.value = { rvars, subscriber };
                for (let rvar of rvars) {
                    if (pVars) {
                        let pvar = pVars[i++];
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
            range.errorNode = u;
        }
        try {
            return await builder.call(this, area);
        }
        catch (err) {
            let message = srcNode instanceof HTMLElement ? `${OuterOpenTag(srcNode, 40)} ${err}` : err;
            if (this.Settings.bAbortOnError)
                throw message;
            console.log(message);
            if (onerr?.bBldr)
                onerr(err);
            else if (this.Settings.bShowErrors) {
                let errNode = area.parent.insertBefore(createErrNode(message), area.range?.FirstOrNext);
                if (range)
                    range.errorNode = errNode;
            }
        }
    }
    async CompScript(srcParent, srcElm, atts) {
        let { type, text, defer, async } = srcElm, src = atts.get('src'), defs = atts.get('defines'), bMod = /^module$|;\s*type\s*=\s*("?)module\1\s*$/i.test(type), bCls = /^((text|application)\/javascript)?$/i.test(type), mOto = /^otoreact(\/((local)|static))?\b/.exec(type), sLoc = mOto && mOto[2], bUpd = atts.getB('updating'), varlist = defs ? defs.split(',') : [], { context } = this, lvars = sLoc && this.NewVars(defs), exp, defNames = lvars ?
            function () {
                let i = 0;
                for (let init of lvars)
                    init()(exp[i++]);
            }
            : function () {
                let i = 0;
                for (let nm of varlist)
                    globalThis[nm] = exp[i++];
            };
        atts.clear();
        if (this.Settings.bRunScripts && (bMod || bCls) || mOto) {
            if (mOto && mOto[3]) {
                let prom = (async () => gEval(`'use strict';([${context}])=>{${src ? await this.FetchText(src) : text}\n;return[${defs}]}`))();
                return async function LSCRIPT(area) {
                    let { range, bInit } = PrepArea(srcElm, area);
                    exp = bUpd || bInit ? range.result = (await prom)(env) : range.result;
                    defNames();
                };
            }
            else if (bMod) {
                let prom = src
                    ? import(this.GetURL(src))
                    : import(src = URL.createObjectURL(new Blob([text.replace(/(\sfrom\s*['"])([^'"]*)(['"])/g, (_, p1, p2, p3) => `${p1}${this.GetURL(p2)}${p3}`)], { type: 'text/javascript' }))).finally(() => URL.revokeObjectURL(src));
                return async function MSCRIPT() {
                    if (!exp) {
                        let e = await prom;
                        exp = varlist.map(nm => {
                            if (!(nm in e))
                                throw `'${nm}' is not exported by this script`;
                            return e[nm];
                        });
                    }
                    defNames();
                };
            }
            else {
                let prom = (async () => `${mOto ? "'use strict';" : ""}${src ? await this.FetchText(src) : text}\n;[${defs}]`)();
                if (src && async)
                    prom = prom.then(txt => void (exp = gEval(txt)));
                else if (!mOto && !defer)
                    exp = gEval(await prom);
                return async function SCRIPT() {
                    let txt = await prom;
                    if (!exp)
                        exp = gEval(txt);
                    defNames();
                };
            }
        }
    }
    async CompFor(srcParent, srcElm, atts) {
        let varName = atts.get('let') ?? atts.get('var'), ixName = atts.get('index'), saved = this.SaveCont();
        if (ixName == '')
            ixName = 'index';
        try {
            if (varName != null) {
                let prevNm = atts.get('previous'), nextNm = atts.get('next');
                if (prevNm == '')
                    prevNm = 'previous';
                if (nextNm == '')
                    nextNm = 'next';
                let getRange = this.CompAttrExpr(atts, 'of', true), getUpdatesTo = this.CompAttrExpr(atts, 'updates'), bReacting = atts.getB('reacting') || atts.getB('reactive') || !!getUpdatesTo, initVar = this.NewVar(varName), initIndex = this.NewVar(ixName), initPrev = this.NewVar(prevNm), initNext = this.NewVar(nextNm), getKey = this.CompAttrExpr(atts, 'key'), getHash = this.CompAttrExpr(atts, 'hash'), bodyBuilder = await this.CompChildNodes(srcElm);
                return async function FOR(area) {
                    let { range, subArea } = PrepArea(srcElm, area, ''), { parent } = subArea, before = subArea.before !== u ? subArea.before : range.Next, iterable = getRange(), pIter = async (iter) => {
                        let svEnv = SaveEnv();
                        try {
                            let keyMap = range.value || (range.value = new Map()), newMap = new Map(), setVar = initVar(), setInd = initIndex();
                            if (iter) {
                                if (!(iter[Symbol.iterator] || iter[Symbol.asyncIterator]))
                                    throw `[of]: Value (${iter}) is not iterable`;
                                let idx = 0;
                                for await (let item of iter) {
                                    setVar(item);
                                    setInd(idx);
                                    let hash = getHash && getHash(), key = getKey?.() ?? hash;
                                    if (key != null && newMap.has(key))
                                        throw `Key '${key}' is not unique`;
                                    newMap.set(key ?? {}, { item, hash, idx });
                                    idx++;
                                }
                            }
                            let nextChild = range.child, setPrev = initPrev(), setNext = initNext(), iterator = newMap.entries(), nextIterator = nextNm ? newMap.values() : null, prevItem, nextItem, prevRange = null, childArea;
                            subArea.parentR = range;
                            if (nextIterator)
                                nextIterator.next();
                            while (1) {
                                let k, v = iterator.next().value;
                                while (nextChild && !newMap.has(k = nextChild.key)) {
                                    if (k != null)
                                        keyMap.delete(k);
                                    nextChild.erase(parent);
                                    nextChild.prev = null;
                                    nextChild = nextChild.next;
                                }
                                if (!v)
                                    break;
                                let [key, { item, hash, idx }] = v, childRange = keyMap.get(key), bInit = !childRange;
                                if (nextIterator)
                                    nextItem = nextIterator.next().value?.item;
                                if (bInit) {
                                    subArea.range = null;
                                    subArea.prevR = prevRange;
                                    subArea.before = nextChild?.FirstOrNext || before;
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
                                        parent.insertBefore(childRange.fragm, nextChild?.FirstOrNext || before);
                                        childRange.fragm = null;
                                    }
                                    else
                                        while (1) {
                                            if (nextChild == childRange)
                                                nextChild = nextChild.next;
                                            else {
                                                if (newMap.get(nextChild.key)?.idx > idx + 2) {
                                                    let fragm = nextChild.fragm = document.createDocumentFragment();
                                                    for (let node of nextChild.Nodes())
                                                        fragm.appendChild(node);
                                                    nextChild = nextChild.next;
                                                    continue;
                                                }
                                                childRange.prev.next = childRange.next;
                                                if (childRange.next)
                                                    childRange.next.prev = childRange.prev;
                                                let nextNode = nextChild?.FirstOrNext || before;
                                                for (let node of childRange.Nodes())
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
                                    setInd(idx);
                                    setPrev(prevItem);
                                    if (nextIterator)
                                        setNext(nextItem);
                                    await bodyBuilder.call(this, childArea);
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
                            RestoreEnv(svEnv);
                        }
                    };
                    if (iterable instanceof Promise) {
                        let subEnv = { env: CloneEnv(env), onerr, onsucc }, rv = range.rvar = RVAR(null, iterable, null, async () => {
                            let save = { env, onerr, onsucc };
                            ({ env, onerr, onsucc } = subEnv);
                            try {
                                await pIter(rv.V);
                            }
                            finally {
                                ({ env, onerr, onsucc } = save);
                            }
                        });
                    }
                    else
                        await pIter(iterable);
                };
            }
            else {
                let nm = atts.get('of', true, true).toLowerCase(), slot = this.CSignatures.get(nm);
                if (!slot)
                    throw `Missing attribute [let]`;
                let initInd = this.NewVar(ixName), bodyBldr = await this.CompChildNodes(srcElm);
                return async function FOREACH_Slot(area) {
                    let { subArea } = PrepArea(srcElm, area), saved = SaveEnv(), slotDef = env.constructs.get(nm), setInd = initInd();
                    try {
                        let idx = 0;
                        for (let slotBldr of slotDef.templates) {
                            setInd(idx++);
                            mapNm(env.constructs, { nm: nm, templates: [slotBldr], constructEnv: slotDef.constructEnv });
                            await bodyBldr.call(this, subArea);
                        }
                    }
                    finally {
                        mapNm(env.constructs, slotDef);
                        RestoreEnv(saved);
                    }
                };
            }
        }
        finally {
            this.RestoreCont(saved);
        }
    }
    CompDefine(srcElm, atts) {
        for (let C of srcElm.childNodes)
            if (C.nodeType != Node.TEXT_NODE || !/^\s*$/.test(C.data))
                throw `<${srcElm.localName} ...> must be followed by </${srcElm.localName}>`;
        let rv = atts.get('rvar'), varNm = rv || atts.get('let') || atts.get('var', true), getVal = this.CompParam(atts, 'value') || dU, getStore = rv && this.CompAttrExpr(atts, 'store'), bReact = atts.getB('reacting') || atts.getB('updating'), newVar = this.NewVar(varNm);
        return [async function DEF(area) {
                let { range, bInit } = PrepArea(srcElm, area);
                if (bInit || bReact) {
                    let v = getVal();
                    if (rv)
                        if (bInit)
                            range.value = new _RVAR(this.RC, null, v, getStore && getStore(), `RVAR_${rv}`);
                        else
                            range.value.SetAsync(v);
                    else
                        range.value = v;
                }
                newVar()(range.value);
            }, rv];
    }
    ParseSignat(elmSignat) {
        let signat = new Signature(elmSignat);
        for (let attr of elmSignat.attributes) {
            if (signat.RestParam)
                throw `Rest parameter must be the last`;
            let m = /^(#|@|\.\.\.|_|)(.*?)(\?)?$/.exec(attr.name);
            if (m[1] != '_') {
                let param = {
                    mode: m[1],
                    nm: m[2],
                    pDflt: m[1] == '...' ? () => []
                        : attr.value != ''
                            ? (m[1] == '#' ? this.CompJScript(attr.value, attr.name) : this.CompString(attr.value, attr.name))
                            : m[3] ? /^on/.test(m[2]) ? () => _ => null : dU
                                : null
                };
                signat.Params.push(param);
                if (m[1] == '...')
                    signat.RestParam = param;
            }
        }
        for (let elmSlot of elmSignat.children)
            mapNm(signat.Slots, this.ParseSignat(elmSlot));
        return signat;
    }
    async CompComponent(srcElm, atts) {
        let builders = [], bEncaps = atts.getB('encapsulate'), styles = [], { wspc } = this, signats = [], elmTemplate;
        for (let child of Array.from(srcElm.children)) {
            let childAtts = new Atts(child), bldr;
            switch (child.nodeName) {
                case 'SCRIPT':
                    bldr = await this.CompScript(srcElm, child, childAtts);
                    break;
                case 'STYLE':
                    if (bEncaps)
                        styles.push(child);
                    else
                        this.CompStyle(child);
                    break;
                case 'DEFINE':
                case 'DEF':
                    [bldr] = this.CompDefine(child, childAtts);
                    break;
                case 'COMPONENT':
                    bldr = await this.CompComponent(child, childAtts);
                    break;
                case 'TEMPLATE':
                    if (elmTemplate)
                        throw 'Double <TEMPLATE>';
                    elmTemplate = child;
                    break;
                case 'SIGNATURE':
                case 'SIGNATURES':
                    for (let elm of child.children)
                        signats.push(this.ParseSignat(elm));
                    break;
                default:
                    if (signats.length)
                        throw `Illegal child element <${child.nodeName}>`;
                    signats.push(this.ParseSignat(child));
                    break;
            }
            if (bldr)
                builders.push([bldr, child]);
        }
        if (!signats.length)
            throw `Missing signature`;
        if (!elmTemplate)
            throw 'Missing <TEMPLATE>';
        for (let signat of signats)
            this.AddConstruct(signat);
        let nm = signats[0].nm, templates = [
            await this.CompTemplate(signats[0], elmTemplate.content, elmTemplate, false, bEncaps, styles)
        ];
        this.wspc = wspc;
        return async function COMPONENT(area) {
            let constr = { nm, templates };
            DefConstruct(constr);
            let saved = SaveEnv();
            try {
                for (let [bldr, srcNode] of builders)
                    await this.CallWithHandling(bldr, srcNode, area);
                constr.constructEnv = CloneEnv(env);
            }
            finally {
                RestoreEnv(saved);
            }
        };
    }
    async CompTemplate(signat, contentNode, srcElm, bNewNames, bEncaps, styles, atts) {
        let saved = this.SaveCont(), myAtts = atts || new Atts(srcElm), lvars = [];
        try {
            for (let { mode, nm } of signat.Params)
                lvars.push([nm, this.NewVar(myAtts.get(mode + nm, bNewNames) || nm)]);
            for (let S of signat.Slots.values())
                this.AddConstruct(S);
            if (!atts)
                myAtts.ChkNoAttsLeft();
            this.wspc = this.rspc = 1;
            let builder = await this.CompChildNodes(contentNode), { nm } = signat, customName = /^[A-Z].*-/.test(nm) ? nm : `rhtml-${nm}`;
            return async function TEMPLATE(area, args, mSlotTemplates, slotEnv) {
                let saved = SaveEnv(), i = 0;
                try {
                    for (let [nm, templates] of mSlotTemplates)
                        DefConstruct({ nm, templates, constructEnv: slotEnv });
                    for (let [nm, lvar] of lvars) {
                        let arg = args[nm], dflt;
                        if (arg === u && (dflt = signat.Params[i]?.pDflt))
                            arg = dflt();
                        lvar()(arg);
                        i++;
                    }
                    if (bEncaps) {
                        let { range: elmRange, childArea, bInit } = PrepElm(srcElm, area, customName), elm = elmRange.node, shadow = elm.shadowRoot || elm.attachShadow({ mode: 'open' });
                        if (bInit)
                            for (let style of styles)
                                shadow.appendChild(style.cloneNode(true));
                        if (signat.RestParam)
                            ApplyMod(elm, 8, null, args[signat.RestParam.nm], bInit);
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
            this.RestoreCont(saved);
        }
    }
    async CompInstance(srcElm, atts, signat) {
        if (signat.prom)
            await signat.prom;
        let { nm, RestParam } = signat, contentSlot = signat.Slots.get('content'), getArgs = [], slotBldrs = new Map();
        for (let nm of signat.Slots.keys())
            slotBldrs.set(nm, []);
        for (let { mode, nm, pDflt } of signat.Params)
            if (mode == '@') {
                let attVal = atts.get(mode + nm, !pDflt);
                getArgs.push(attVal
                    ? [nm, this.CompJScript(attVal, mode + nm),
                        this.CompJScript(`ORx=>{${attVal}=ORx}`, nm)]
                    : [nm, u, () => dU]);
            }
            else if (mode != '...') {
                let dH = this.CompParam(atts, nm, !pDflt);
                if (dH)
                    getArgs.push([nm, dH]);
            }
        let slotElm, Slot;
        for (let node of Array.from(srcElm.childNodes))
            if (node.nodeType == Node.ELEMENT_NODE
                && (Slot = signat.Slots.get((slotElm = node).localName))
                && slotElm.localName != 'content') {
                slotBldrs.get(slotElm.localName).push(await this.CompTemplate(Slot, slotElm, slotElm, true));
                srcElm.removeChild(node);
            }
        if (contentSlot)
            slotBldrs.get('content').push(await this.CompTemplate(contentSlot, srcElm, srcElm, true, false, null, atts));
        if (RestParam) {
            let modifs = this.CompAttribs(atts);
            getArgs.push([RestParam.nm,
                () => modifs.map(({ mt, nm, depV }) => ({ mt, nm, value: depV() }))]);
        }
        atts.ChkNoAttsLeft();
        this.wspc = 3;
        return async function INSTANCE(area) {
            let svEnv = env, cdef = env.constructs.get(nm), { range, subArea, bInit } = PrepArea(srcElm, area);
            if (!cdef)
                return;
            bReadOnly = 1;
            let args = range.value || (range.value = {});
            for (let [nm, dGet, dSet] of getArgs)
                if (!dSet)
                    args[nm] = dGet();
                else if (bInit)
                    args[nm] = RVAR('', dGet && dGet(), null, dSet());
                else if (dGet)
                    args[nm].V = dGet();
            bReadOnly = 0;
            env = cdef.constructEnv;
            try {
                for (let { nm, pDflt } of signat.Params)
                    if (args[nm] === u)
                        args[nm] = pDflt();
                for (let template of cdef.templates)
                    await template.call(this, subArea, args, slotBldrs, svEnv);
            }
            finally {
                env = svEnv;
            }
        };
    }
    async CompHTMLElement(srcElm, atts) {
        let nm = srcElm.localName.replace(/\.+$/, ''), preWs = this.wspc, postWs;
        if (this.mPreformatted.has(nm)) {
            this.wspc = 4;
            postWs = 1;
        }
        else if (RCompiler.regBlock.test(nm))
            postWs = this.wspc = this.rspc = 1;
        else if (RCompiler.regInline.test(nm)) {
            this.wspc = this.rspc = 1;
            postWs = 3;
        }
        if (preWs == 4)
            postWs = 4;
        let modifs = this.CompAttribs(atts), childnodesBldr = await this.CompChildNodes(srcElm);
        if (postWs)
            this.wspc = postWs;
        let bldr = async function ELEMENT(area) {
            let { range: { node }, childArea, bInit } = PrepElm(srcElm, area, nm);
            if (!area.bRootOnly)
                await childnodesBldr.call(this, childArea);
            node.removeAttribute('class');
            if (node.handlers)
                for (let { evType, listener } of node.handlers)
                    node.removeEventListener(evType, listener);
            node.handlers = [];
            ApplyMods(node, modifs, bInit);
        };
        bldr.ws = postWs == 1
            || preWs < 4 && childnodesBldr.ws;
        return bldr;
    }
    CompAttribs(atts) {
        let modifs = [], m;
        for (let [nm, V] of atts) {
            try {
                if (m = /(.*?)\.+$/.exec(nm))
                    modifs.push({
                        mt: 0,
                        nm,
                        depV: this.CompString(V, nm)
                    });
                else if (m = /^on(.*?)\.*$/i.exec(nm))
                    modifs.push({
                        mt: 5,
                        nm: CapitalProp(m[0]),
                        depV: this.AddErrH(this.CompHandler(nm, V))
                    });
                else if (m = /^#class[:.](.*)$/.exec(nm))
                    modifs.push({
                        mt: 3, nm: m[1],
                        depV: this.CompJScript(V, nm)
                    });
                else if (m = /^#style\.(.*)$/.exec(nm))
                    modifs.push({
                        mt: 4, nm: CapitalProp(m[1]),
                        depV: this.CompJScript(V, nm)
                    });
                else if (m = /^style\.(.*)$/.exec(nm))
                    modifs.push({
                        mt: 4, nm: CapitalProp(m[1]),
                        depV: this.CompString(V, nm)
                    });
                else if (nm == '+style')
                    modifs.push({
                        mt: 6, nm,
                        depV: this.CompJScript(V, nm)
                    });
                else if (nm == "+class")
                    modifs.push({
                        mt: 7, nm,
                        depV: this.CompJScript(V, nm)
                    });
                else if (m = /^([\*\+#!]+|@@?)(.*?)\.*$/.exec(nm)) {
                    let m2 = CapitalProp(m[2]), setter;
                    if (m2 == 'class')
                        m2 = 'className';
                    try {
                        setter = m[1] == '#' ? null : this.CompJScript(`function(){let ORx=this.${m2};if(${V}!==ORx)${V}=ORx}`, nm);
                    }
                    catch (err) {
                        throw `Invalid left-hand side '${V}'`;
                    }
                    if (/[@#]/.test(m[1])) {
                        let depV = this.CompJScript(V, nm);
                        modifs.push(/^on/.test(m2)
                            ? { mt: 5, nm: m2, depV: this.AddErrH(depV) }
                            : { mt: 1, nm: m2, depV });
                    }
                    if (/\*/.test(m[1]))
                        modifs.push({ mt: 9, nm: 'oncreate', depV: setter });
                    if (/\+/.test(m[1]))
                        modifs.push({ mt: 10, nm: 'onupdate', depV: setter });
                    if (/[@!]/.test(m[1]))
                        modifs.push({ mt: 5,
                            nm: /!!|@@/.test(m[1]) ? 'onchange' : 'oninput',
                            depV: setter });
                }
                else if (m = /^\.\.\.(.*)/.exec(nm)) {
                    if (V)
                        throw 'A rest parameter cannot have a value';
                    modifs.push({
                        mt: 8, nm,
                        depV: this.CompName(m[1])
                    });
                }
                else if (nm == 'src')
                    modifs.push({
                        mt: 2,
                        nm: this.FilePath,
                        depV: this.CompString(V, nm),
                    });
                else
                    modifs.push({
                        mt: 0,
                        nm,
                        depV: this.CompString(V, nm)
                    });
            }
            catch (err) {
                throw (`[${nm}]: ${err}`);
            }
        }
        atts.clear();
        return modifs;
    }
    CompStyle(srcStyle) {
        this.head.appendChild(srcStyle);
        this.AddedHdrElms.push(srcStyle);
    }
    CompString(data, nm) {
        let regIS = this.regIS || (this.regIS = new RegExp(/(\\[${])|/.source
            + (this.Settings.bDollarRequired ? /\$/ : /\$?/).source
            + /\{((\{(\{.*?\}|.)*?\}|'.*?'|".*?"|`.*?`|\\\}|.)*?)\}|$/.source, 'gs')), gens = [], ws = nm || this.Settings.bKeepWhiteSpace ? 4 : this.wspc, isTriv = true, bThis = false, lastIndex = regIS.lastIndex = 0, dep;
        ;
        while (regIS.lastIndex < data.length) {
            let m = regIS.exec(data);
            if (!m[1]) {
                let fixed = lastIndex < m.index ? data.substring(lastIndex, m.index) : null;
                if (fixed) {
                    fixed = fixed.replace(/\\([${}\\])/g, '$1');
                    if (ws < 4) {
                        fixed = fixed.replace(/[ \t\n\r]+/g, ' ');
                        if (ws <= 2 && !gens.length)
                            fixed = fixed.replace(/^ /, '');
                        if (this.rspc && !m[2] && regIS.lastIndex == data.length)
                            fixed = fixed.replace(/ $/, '');
                    }
                    if (fixed)
                        gens.push(fixed);
                }
                if (m[2]) {
                    let getS = this.CompJScript(m[2], nm, '{}');
                    gens.push(getS);
                    isTriv = false;
                    bThis || (bThis = getS.bThis);
                }
                lastIndex = regIS.lastIndex;
            }
        }
        if (isTriv) {
            let s = gens.join('');
            dep = () => s;
            dep.fixed = s;
        }
        else
            dep = bThis ?
                function () {
                    try {
                        let s = "";
                        for (let gen of gens)
                            s += typeof gen == 'string' ? gen : gen.call(this) ?? '';
                        return s;
                    }
                    catch (err) {
                        throw nm ? `[${nm}]: ${err}` : err;
                    }
                }
                : () => {
                    try {
                        let s = "";
                        for (let gen of gens)
                            s += typeof gen == 'string' ? gen : gen() ?? '';
                        return s;
                    }
                    catch (err) {
                        throw nm ? `[${nm}]: ${err}` : err;
                    }
                };
        dep.bThis = bThis;
        return dep;
    }
    CompPattern(patt, url) {
        let reg = '', lvars = [], regIS = /\\[{}]|\{((?:[^}]|\\\})*)\}|\?|\*|(\\.)|\[\^?(?:\\.|[^\\\]])*\]|$/gs;
        while (regIS.lastIndex < patt.length) {
            let lastIndex = regIS.lastIndex, m = regIS.exec(patt), literals = patt.substring(lastIndex, m.index);
            if (literals)
                reg += quoteReg(literals);
            reg +=
                m[1]
                    ? (lvars.push(this.NewVar(m[1])), `(.*?)`)
                    : m[0] == '?' ? '.'
                        : m[0] == '*' ? '.*'
                            : m[2] ? m[2]
                                : m[0];
        }
        return { lvars, regex: new RegExp(`^${reg}$`, 'i'), url };
    }
    CompParam(atts, attName, bReq) {
        let v = atts.get(attName);
        return (v == null ? this.CompAttrExpr(atts, attName, bReq)
            : /^on/.test(attName) ? this.CompHandler(attName, v)
                : this.CompString(v, attName));
    }
    CompAttrExpr(atts, attName, bReq) {
        return this.CompJScript(atts.get(attName, bReq, true), attName);
    }
    CompHandler(nm, text) {
        return /^#/.test(nm) ? this.CompJScript(text, nm)
            : this.CompJScript(`function(event){${text}\n}`, nm);
    }
    CompJScript(expr, descrip, delims = '""') {
        if (expr == null)
            return null;
        let bThis = /\bthis\b/.test(expr), depExpr = bThis ?
            `'use strict';(function expr([${this.context}]){return (${expr}\n)})`
            : `'use strict';([${this.context}])=>(${expr}\n)`, errorInfo = `${descrip ? `[${descrip}] ` : ''}${delims[0]}${Abbrev(expr, 60)}${delims[1]}: `;
        try {
            let rout = gEval(depExpr), depV = (bThis
                ? function () {
                    try {
                        return rout.call(this, env);
                    }
                    catch (err) {
                        throw errorInfo + err;
                    }
                }
                : () => {
                    try {
                        return rout(env);
                    }
                    catch (err) {
                        throw errorInfo + err;
                    }
                });
            depV.bThis = bThis;
            return depV;
        }
        catch (err) {
            throw errorInfo + err;
        }
    }
    CompName(nm) {
        let i = this.ContextMap.get(nm);
        if (i === u)
            throw `Unknown name '${nm}'`;
        return () => env[i];
    }
    compAttrExprList(atts, attName, bReacts) {
        let list = atts.get(attName, false, true);
        if (!list)
            return null;
        if (bReacts)
            for (let nm of list.split(','))
                this.cRvars.set(nm.trim(), false);
        return list ? this.CompJScript(`[${list}\n]`, attName) : null;
    }
    AddErrH(getHndlr) {
        return () => {
            let hndlr = getHndlr(), sErr = onerr, sSuc = onsucc;
            if (hndlr && (sErr || sSuc))
                return function hError(ev) {
                    try {
                        let r = hndlr.call(this, ev);
                        if (r instanceof Promise)
                            return r.then(sSuc, sErr);
                        if (sSuc)
                            sSuc(null);
                        return r;
                    }
                    catch (err) {
                        if (!sErr)
                            throw err;
                        sErr(err);
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
    async FetchText(src) {
        return await (await RFetch(this.GetURL(src))).text();
    }
}
RCompiler.iNum = 0;
RCompiler.genAtts = /^#?(?:((?:this)?reacts?on)|on(create|update)+|on(?:(error)-?|success))$/;
RCompiler.regBlock = /^(body|blockquote|d[dlt]|div|form|h\d|hr|li|ol|p|table|t[rhd]|ul|select|title)$/;
RCompiler.regInline = /^(button|input|img)$/;
export async function RFetch(input, init) {
    let r = await gFetch(input, init);
    if (!r.ok)
        throw `${init?.method || 'GET'} ${input} returned ${r.status} ${r.statusText}`;
    return r;
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
        let s = store && store.getItem(storeName);
        if (s != null)
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
            this.V = u;
            t.then(v => { this.V = v; }, onerr);
        }
        else
            this.V = t;
    }
    get Set() {
        return this.SetAsync.bind(this);
    }
    get Clear() {
        return () => { this.V = u; };
    }
    get U() {
        if (!bReadOnly)
            this.SetDirty();
        return this._Value;
    }
    set U(t) { this._Value = t; this.SetDirty(); }
    SetDirty() {
        if (this.store)
            this.RC.DirtyVars.add(this);
        let b;
        for (let sub of this._Subscribers)
            if (sub.bImm)
                sub(this._Value);
            else if (!sub.sArea?.range?.erased)
                this.RC.AddDirty(b = sub);
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
        for (let att of elm.attributes)
            if (!/^_/.test(att.name))
                super.set(att.name, att.value);
    }
    get(nm, bRequired, bHashAllowed) {
        let n = nm, value = super.get(n);
        if (value == null && bHashAllowed) {
            n = '#' + nm;
            value = super.get(n);
        }
        if (value != null)
            super.delete(n);
        else if (bRequired)
            throw `Missing attribute [${nm}]`;
        return value;
    }
    getB(nm) {
        let s = this.get(nm);
        if (s != null)
            switch (s.toLowerCase()) {
                case "":
                case "yes":
                case "true":
                    return true;
                case "no":
                case "false":
                    return false;
            }
        return null;
    }
    ChkNoAttsLeft() {
        if (super.size)
            throw `Unknown attribute${super.size > 1 ? 's' : ''}: ${Array.from(super.keys()).join(',')}`;
    }
}
let regIdent = /^[A-Za-z_$][A-Za-z0-9_$]*$/, regReserv = /^(?:break|case|catch|class|continue|debugger|default|delete|do|else|export|extends|finally|for|function|if|import|in|instanceof|new|return|super|switch|this|throw|try|typeof|var|void|while|with|enum|implements|interface|let|package|private|protected|public|static|yield|null|true|false)$/;
function CheckIdentifier(nm) {
    if (!regIdent.test(nm = nm.trim()))
        throw `Invalid identifier '${nm}'`;
    if (regReserv.test(nm))
        throw `Reserved keyword '${nm}'`;
    return nm;
}
let words = 'access|active|align|animation|aria|as|backface|background|basis|blend|border|bottom|box|bounding|break|caption|caret|character|child|class|client|clip|column|(?:col|row)(?=span)|content|counter|css|decoration|default|design|document|element|empty|feature|fill|first|flex|font|form|get|grid|hanging|image|inner|input(?=mode)|^is|hanging|last|left|letter|line|list|margin|^max|^min|^nav|next|node|object|offset|outer|outline|overflow|owner|padding|page|parent|perspective|previous|ready?|right|size|rule|scroll|selected|selection|table|tab(?=index)|tag|text|top|transform|transition|unicode|user|validation|value|variant|vertical|white|will|word|^z', regCapitalize = new RegExp(`(html|uri)|(${words})|.`, "g");
function CapitalProp(lcName) {
    let bHadWord;
    return lcName.replace(regCapitalize, (w, p1, p2) => {
        let r = p1 ? w.toUpperCase()
            : bHadWord ? w.substring(0, 1).toUpperCase() + w.substring(1)
                : w;
        bHadWord = p2;
        return r;
    });
}
function OuterOpenTag(elm, maxLength) {
    return Abbrev(/<.*?(?=>)/s.exec(elm.outerHTML)[0], maxLength - 1) + '>';
}
function Abbrev(s, maxLength) {
    return (maxLength && s.length > maxLength
        ? s.substring(0, maxLength - 3) + "..."
        : s);
}
function mapNm(m, v) {
    m.set(v.nm, v);
}
function mapSet(m, nm, v) {
    if (v)
        m.set(nm, v);
    else
        m.delete(nm);
}
function* concIterable(R, S) {
    for (let x of R)
        yield x;
    for (let x of S)
        yield x;
}
function createErrNode(msg) {
    let n = document.createElement('div');
    n.style.color = 'crimson';
    n.style.fontFamily = 'sans-serif';
    n.style.fontSize = '10pt';
    n.innerText = msg;
    return n;
}
function copyStyleSheets(S, D) {
    for (let SSheet of S.styleSheets) {
        let DSheet = D.head.appendChild(D.createElement('style')).sheet;
        for (let rule of SSheet.cssRules)
            DSheet.insertRule(rule.cssText);
    }
}
Object.defineProperties(globalThis, {
    RVAR: { get: () => R.RVAR.bind(R) },
    RUpdate: { get: () => R.RUpdate.bind(R) },
});
let _range = globalThis.range = function* range(from, upto, step = 1) {
    if (upto === u) {
        upto = from;
        from = 0;
    }
    for (let i = from; i < upto; i += step)
        yield i;
};
globalThis.RCompile = RCompile;
globalThis.RBuild = RBuild;
export let R = new RCompiler(), RVAR = globalThis.RVAR, RUpdate = globalThis.RUpdate, docLocation = RVAR('docLocation', location.href), reroute = globalThis.reroute =
    (arg) => {
        if (typeof arg == 'object') {
            if (arg.ctrlKey)
                return;
            arg.preventDefault();
            arg = arg.target.href;
        }
        docLocation.V = new URL(arg, location.href).href;
    };
export { _range as range };
Object.defineProperty(docLocation, 'subpath', { get: () => location.pathname.substring(docLocation.basepath.length) });
docLocation.search =
    (key, val) => {
        let url = new URL(location.href);
        if (val == null)
            url.searchParams.delete(key);
        else
            url.searchParams.set(key, val);
        return url.href;
    };
docLocation.Subscribe(loc => {
    if (loc != location.href)
        history.pushState(null, null, loc);
    docLocation.searchParams = new URLSearchParams(location.search);
    ScrollToHash();
}, true);
window.addEventListener('popstate', () => { docLocation.V = location.href; });
function ScrollToHash() {
    if (location.hash)
        setTimeout((() => document.getElementById(location.hash.substring(1))?.scrollIntoView()), 6);
}
