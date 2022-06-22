let defaultSettings = {
    bTiming: false,
    bAbortOnError: false,
    bShowErrors: true,
    bRunScripts: false,
    basePattern: '/',
    preformatted: [],
    bNoGlobals: false,
    bDollarRequired: false,
    bSetPointer: true,
    bKeepWhiteSpace: false,
    bKeepComments: false,
}, parser = new DOMParser(), gEval = eval, gFetch = fetch, u = undefined, n = null, w = window;
w.globalThis || (w.globalThis = w);
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
        let { node, child } = this;
        if (node && parent) {
            parent.removeChild(node);
            parent = null;
        }
        this.child = null;
        while (child) {
            child.erase(child.newParent || parent);
            child.parentR = null;
            if (child.rvars)
                for (let rvar of child.rvars)
                    rvar._Subscribers.delete(child.subs);
            if (child.onDest)
                child.onDest.call(child.node);
            child = child.next;
        }
    }
}
let dU = () => u;
function PrepArea(srcElm, area, text = '', nWipe, result) {
    let { parent, rng } = area, sub = { parent, rng: null }, bInit = !rng;
    if (bInit) {
        sub.source = area.source;
        sub.before = area.before;
        if (srcElm)
            text = srcElm.localName + (text && ' ') + text;
        UpdPrevRange(area, rng = sub.parentR = new Range(null, area, text));
        rng.result = result;
    }
    else {
        sub.rng = rng.child;
        area.rng = rng.next;
        if (nWipe && (nWipe == 2 || result != rng.result)) {
            rng.result = result;
            rng.erase(parent);
            sub.rng = null;
            sub.before = rng.Next;
            sub.parentR = rng;
            bInit = 1;
        }
    }
    return { rng, sub, bInit };
}
function UpdPrevRange(area, rng) {
    let r;
    if (r = area.prevR)
        r.next = rng;
    else if (r = area.parentR)
        r.child = rng;
    area.prevR = rng;
}
function PrepElm(srcElm, area, nodeName = srcElm.nodeName) {
    let rng = area.rng, bInit = !rng;
    if (bInit) {
        rng = new Range(area.source == srcElm
            ? (srcElm.innerHTML = "", srcElm)
            : area.parent.insertBefore(document.createElement(nodeName), area.before), area);
        UpdPrevRange(area, rng);
    }
    else
        area.rng = rng.next;
    return {
        rng,
        childArea: {
            parent: rng.node,
            rng: rng.child,
            before: null,
            parentR: rng
        },
        bInit
    };
}
function PrepCharData(area, content, bComm) {
    let rng = area.rng;
    if (!rng)
        UpdPrevRange(area, new Range(area.parent.insertBefore(bComm ? document.createComment(content) : document.createTextNode(content), area.before), area));
    else {
        rng.node.data = content;
        area.rng = rng.next;
    }
}
let childWins = new Set();
export async function RCompile(elm, settings) {
    try {
        let { basePattern } = R.Settings = { ...defaultSettings, ...settings }, m = location.href.match(`^.*(${basePattern})`);
        R.FilePath = location.origin + (docLocation.basepath = m ? (new URL(m[0])).pathname.replace(/[^/]*$/, '') : '');
        R.RootElm = elm;
        await R.Compile(elm);
        R.start = performance.now();
        builtNodeCnt = 0;
        let area = { parent: elm.parentElement, source: elm, rng: n };
        await R.Build(area);
        w.addEventListener('pagehide', () => childWins.forEach(w => w.close()));
        R.logTime(`${R.num}: Built ${builtNodeCnt} nodes in ${(performance.now() - R.start).toFixed(1)} ms`);
        ScrollToHash();
    }
    catch (err) {
        alert(`OtoReact error: ` + err);
    }
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
        this.RestParam = n;
        this.Slots = new Map();
        this.nm = srcElm.localName;
    }
    IsCompatible(sig) {
        if (!sig)
            return;
        let r = 1, mapSigParams = new Map(sig.Params.map(p => [p.nm, p.pDflt]));
        for (let { nm, pDflt } of this.Params)
            if (mapSigParams.has(nm)) {
                r && (r = !pDflt || mapSigParams.get(nm));
                mapSigParams.delete(nm);
            }
            else
                r = 0;
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
function ApplyMods(elm, modifs, bCreate) {
    bReadOnly = 1;
    for (let { mt, nm, depV } of modifs)
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
function DefConstr(C) {
    let { constructs } = env, prevDef = constructs.get(C.nm);
    mapNm(constructs, C);
    envActions.push(() => mapSet(constructs, C.nm, prevDef));
}
let updCnt = 0;
class RCompiler {
    constructor(RC, bClr) {
        this.num = RCompiler.iNum++;
        this.cRvars = new Map();
        this.restoreActions = [];
        this.mPreformatted = new Set(['pre']);
        this.wspc = 1;
        this.rspc = 1;
        this.DirtyVars = new Set();
        this.hUpdate = n;
        this.sourceNodeCount = 0;
        this.Settings = RC ? { ...RC.Settings } : { ...defaultSettings };
        this.RC = RC || (RC = this);
        this.FilePath = RC.FilePath;
        this.head = RC.head || document.head;
        if (bClr)
            RC = this;
        this.context = RC?.context || "";
        this.ContextMap = RC ? new Map(RC.ContextMap) : new Map();
        this.CSignatures = RC ? new Map(RC.CSignatures) : new Map();
        this.StyleBefore = RC.StyleBefore;
    }
    SaveCont() {
        return this.restoreActions.length;
    }
    RestoreCont(sv) {
        for (let j = this.restoreActions.length; j > sv; j--)
            this.restoreActions.pop()();
    }
    NewV(nm) {
        let lv;
        if (!(nm = nm?.trim()))
            lv = ((_) => { });
        else {
            nm = CheckIdentifier(nm);
            let i = this.ContextMap.get(nm);
            if (i == n) {
                let prevCont = this.context;
                i = this.ContextMap.size;
                this.ContextMap.set(nm, i);
                this.context += `${nm},`;
                this.restoreActions.push(() => {
                    this.ContextMap.delete(nm);
                    this.context = prevCont;
                });
                lv = ((v) => {
                    envActions.push(() => { env.length = i; });
                    env[i] = v;
                });
            }
            else
                lv = ((v) => {
                    let prev = env[i];
                    envActions.push(() => { env[i] = prev; });
                    env[i] = v;
                });
            lv.I = i;
        }
        lv.nm = nm;
        return lv;
    }
    SetVar(lv, v) {
        if (lv.I >= 0)
            env[lv.I] = v;
    }
    NewVars(varlist) {
        return (varlist
            ? varlist.split(',').map(nm => this.NewV(nm))
            : []);
    }
    AddConstructs(listS) {
        for (let S of listS) {
            let savedC = this.CSignatures.get(S.nm);
            mapNm(this.CSignatures, S);
            this.restoreActions.push(() => mapSet(this.CSignatures, S.nm, savedC));
        }
    }
    async Compile(elm, settings = {}, childnodes) {
        let t0 = performance.now(), savedR = R;
        Object.assign(this.Settings, settings);
        for (let tag of this.Settings.preformatted)
            this.mPreformatted.add(tag.toLowerCase());
        try {
            R = this;
            this.Builder = childnodes
                ? await this.CompChildNodes(elm, childnodes)
                : (await this.CompElm(elm.parentElement, elm, 1))[0];
            this.bCompiled = 1;
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
    Subscriber({ parent, bRootOnly }, builder, rng, ...args) {
        if (rng)
            rng.updated = updCnt;
        let sArea = {
            parent, bRootOnly,
            rng,
        }, subEnv = { env: CloneEnv(env), onerr, onsucc }, subs = async () => {
            let { rng } = sArea, save = { env, onerr, onsucc };
            if ((rng.updated || 0) < updCnt) {
                ({ env, onerr, onsucc } = subEnv);
                rng.updated = updCnt;
                builtNodeCnt++;
                try {
                    await builder.call(this, { ...sArea }, ...args);
                }
                finally {
                    ({ env, onerr, onsucc } = save);
                }
            }
        };
        subs.sArea = sArea;
        subs.ref = rng;
        subs.env = subEnv.env;
        return subs;
    }
    async Build(area) {
        let saveR = R;
        R = this;
        env = NewEnv();
        builtNodeCnt++;
        await this.Builder(area);
        R = saveR;
    }
    RUpdate() {
        if (!this.bUpdating && !this.hUpdate)
            this.hUpdate = setTimeout(() => {
                this.hUpdate = n;
                this.DoUpdate();
            }, 5);
    }
    async DoUpdate() {
        if (!this.bCompiled || this.bUpdating)
            return;
        this.bUpdating = 1;
        let saveR = R;
        R = this;
        try {
            builtNodeCnt = 0;
            this.start = performance.now();
            while (this.DirtyVars.size) {
                updCnt++;
                let dv = this.DirtyVars;
                this.DirtyVars = new Set();
                for (let rv of dv) {
                    if (rv.store)
                        rv.Save();
                    for (let subs of rv._Subscribers)
                        if (!subs.bImm)
                            try {
                                await subs();
                            }
                            catch (err) {
                                let msg = `ERROR: ` + err;
                                console.log(msg);
                                alert(msg);
                            }
                }
            }
            this.logTime(`${R.num}: Updated ${builtNodeCnt} nodes in ${(performance.now() - this.start).toFixed(1)} ms`);
        }
        finally {
            R = saveR;
            this.bUpdating = 0;
        }
    }
    RVAR(nm, value, store, subs, storeName) {
        let r = new _RVAR(this.RC, nm, value, store, storeName);
        if (subs)
            r.Subscribe(subs, 1, 0);
        return r;
    }
    RVAR_Light(t, updatesTo) {
        if (!t._Subscribers) {
            t._Subscribers = new Set();
            t._UpdatesTo = updatesTo;
            let { RC } = this;
            Object.defineProperty(t, 'U', { get: () => {
                    if (!bReadOnly) {
                        RC.DirtyVars.add(t);
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
                            [async (area) => PrepCharData(area, getText(), 1), srcNode, 1];
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
            return n;
        let Iter = async function Iter(area, start = 0) {
            let i = 0, toSubscribe = [];
            if (!area.rng) {
                for (let [bldr] of builders) {
                    i++;
                    await bldr.call(this, area);
                    if (bldr.auto)
                        toSubscribe.push(this.Subscriber(area, Iter, area.prevR, i));
                }
                for (let subs of toSubscribe) {
                    let { sArea } = subs, r = sArea.rng, rvar = r.value;
                    if (!rvar._Subscribers.size && r.next) {
                        (sArea.rng = r.next).updated = 0;
                        subs.ref = {};
                        rvar.Subscribe(rvar.auto = subs);
                    }
                }
            }
            else
                for (let [bldr] of builders)
                    if (i++ >= start) {
                        let r = area.rng;
                        await bldr.call(this, area);
                        if (bldr.auto && r.value.auto)
                            assignEnv(r.value.auto.env, env);
                    }
            builtNodeCnt += builders.length - start;
        };
        Iter.ws = builders[0][0].ws;
        return Iter;
    }
    async CompElm(srcPrnt, srcElm, bUnhide) {
        let atts = new Atts(srcElm), reacts = [], genMods = [], dIf, raLength = this.restoreActions.length, dOnDest, depOnerr, depOnsucc, bldr, elmBldr, isBl, m;
        if (bUnhide)
            atts.set('#hidden', 'false');
        try {
            dIf = this.CompAttrExpr(atts, 'if');
            for (let attNm of atts.keys())
                if (m = RCompiler.genAtts.exec(attNm))
                    if (m[1])
                        reacts.push({ attNm, rvars: this.compAttrExprList(atts, attNm, 1) });
                    else {
                        let txt = atts.get(attNm);
                        if (m[2])
                            genMods.push({ attNm, txt, C: /c/i.test(m[2]), U: /u/i.test(m[2]), D: /y/i.test(m[2]) });
                        else {
                            let hndlr = this.CompHandler(attNm, txt);
                            if (m[4])
                                (depOnerr = hndlr).bBldr = !/-$/.test(attNm);
                            else
                                depOnsucc = hndlr;
                        }
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
                                this.cRvars.set(rv, 1);
                                this.restoreActions.push(() => {
                                    if (elmBldr)
                                        elmBldr.auto = this.cRvars.get(rv);
                                    this.cRvars.set(rv, a);
                                });
                            }
                            isBl = 1;
                        }
                        break;
                    case 'if':
                    case 'case':
                        {
                            let bHiding = atts.getB('hiding'), getVal = this.CompAttrExpr(atts, 'value'), caseNodes = [], body = [], bThen;
                            for (let node of srcElm.childNodes) {
                                if (node.nodeType == Node.ELEMENT_NODE)
                                    switch (node.nodeName) {
                                        case 'THEN':
                                            bThen = 1;
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
                                    let cond = n, not = true, patt = n, p;
                                    switch (node.nodeName) {
                                        case 'WHEN':
                                        case 'IF':
                                        case 'THEN':
                                            cond = this.CompAttrExpr(atts, 'cond');
                                            not = !atts.getB('not');
                                            patt =
                                                (p = atts.get('match')) != n
                                                    ? this.CompPattern(p)
                                                    : (p = atts.get('urlmatch')) != n
                                                        ? this.CompPattern(p, 1)
                                                        : (p = atts.get('regmatch')) != n
                                                            ? { regex: new RegExp(p, 'i'),
                                                                lvars: this.NewVars(atts.get('captures'))
                                                            }
                                                            : n;
                                            if (bHiding && patt?.lvars.length)
                                                throw `Pattern capturing cannot be combined with hiding`;
                                            if (patt && !getVal)
                                                throw `Match requested but no 'value' specified.`;
                                        case 'ELSE':
                                            caseList.push({ cond, not, patt,
                                                bldr: await this.CompChildNodes(node, body),
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
                                    let value = getVal && getVal(), choosenAlt = n, matchResult;
                                    for (let alt of caseList)
                                        try {
                                            if (!((!alt.cond || alt.cond())
                                                && (!alt.patt || value != n && (matchResult = alt.patt.regex.exec(value)))) != alt.not) {
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
                                            let { rng, childArea, bInit } = PrepElm(alt.node, area);
                                            if ((!(rng.node.hidden = alt != choosenAlt)
                                                || bInit)
                                                && !area.bRootOnly)
                                                await this.CallWithHandling(alt.bldr, alt.node, childArea);
                                        }
                                    }
                                    else {
                                        let { sub, bInit } = PrepArea(srcElm, area, '', 1, choosenAlt);
                                        if (choosenAlt && (!area.bRootOnly || bInit)) {
                                            let saved = SaveEnv(), i = 0;
                                            try {
                                                if (choosenAlt.patt)
                                                    for (let lv of choosenAlt.patt.lvars)
                                                        lv((choosenAlt.patt.url ? decodeURIComponent : (r) => r)(matchResult[++i]));
                                                await this.CallWithHandling(choosenAlt.bldr, choosenAlt.node, sub);
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
                        bldr = await this.CompFor(srcElm, atts);
                        break;
                    case 'module':
                        atts.get('id');
                        break;
                    case 'include':
                        {
                            let src = atts.get('src', 1), C = new RCompiler(this);
                            C.FilePath = this.GetPath(src);
                            let task = (async () => {
                                await C.Compile(n, { bRunScripts: true }, await this.fetchModule(src));
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
                            let src = atts.get('src', 1), bIncl = atts.getB('include'), vars = this.NewVars(atts.get('defines')), bAsync = atts.getB('async'), listImports = new Array(), promModule = RModules.get(src);
                            for (let child of srcElm.children) {
                                let sign = this.ParseSignat(child);
                                listImports.push(sign);
                            }
                            this.AddConstructs(listImports);
                            if (!promModule) {
                                let C = new RCompiler(this, 1);
                                C.Settings.bRunScripts = true;
                                C.FilePath = this.GetPath(src);
                                promModule = this.fetchModule(src, 1).then(async (nodes) => {
                                    let bldr = await C.CompIter(n, nodes);
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
                                    DefConstr(MEnv.constructs.get(nm));
                                for (let lv of vars)
                                    lv(MEnv[lv.i]);
                            };
                            isBl = 1;
                        }
                        break;
                    case 'react':
                        {
                            let getRvars = this.compAttrExprList(atts, 'on', 1), getHashes = this.compAttrExprList(atts, 'hash'), bodyBuilder = await this.CompChildNodes(srcElm);
                            bldr = this.GetREACT(srcElm, 'on', bodyBuilder, getRvars, atts.getB('renew'));
                            if (getHashes) {
                                let b = bldr;
                                bldr = async function HASH(area) {
                                    let { sub, rng } = PrepArea(srcElm, area, 'hash'), hashes = getHashes();
                                    if (!rng.value || hashes.some((hash, i) => hash !== rng.value[i])) {
                                        rng.value = hashes;
                                        await b.call(this, sub);
                                    }
                                };
                                bldr.ws = b.ws;
                            }
                        }
                        break;
                    case 'rhtml':
                        {
                            let getSrctext = this.CompParam(atts, 'srctext', 1), modifs = this.CompAttribs(atts);
                            this.wspc = 1;
                            bldr = async function RHTML(area) {
                                let srctext = getSrctext(), { rng, bInit } = PrepElm(srcElm, area, 'rhtml-rhtml'), { node } = rng;
                                ApplyMods(node, modifs, bInit);
                                if (area.prevR || srctext != rng.result) {
                                    rng.result = srctext;
                                    let shadowRoot = node.shadowRoot || node.attachShadow({ mode: 'open' }), tempElm = document.createElement('rhtml'), svEnv = env, R = new RCompiler();
                                    try {
                                        R.FilePath = this.FilePath;
                                        (R.head = shadowRoot).innerHTML = '';
                                        tempElm.innerHTML = srctext;
                                        await R.Compile(tempElm, { bRunScripts: true, bTiming: this.Settings.bTiming }, tempElm.childNodes);
                                        await R.Build({ parent: shadowRoot, rng: n,
                                            parentR: new Range(n, n, 'Shadow') });
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
                        bldr = await this.CompScript(srcPrnt, srcElm, atts);
                        isBl = 1;
                        break;
                    case 'style':
                        this.CompStyle(srcElm);
                        isBl = 1;
                        break;
                    case 'component':
                    case 'components':
                        bldr = await this.CompComponent(srcElm, atts);
                        isBl = 1;
                        break;
                    case 'document':
                        {
                            let docVar = this.NewV(atts.get('name', 1)), RC = this, saved = this.SaveCont();
                            try {
                                let bEncaps = atts.getB('encapsulate'), setVars = this.NewVars(atts.get('params')), setWin = this.NewV(atts.get('window')), docBuilder = await RC.CompChildNodes(srcElm);
                                bldr = async function DOCUMENT(area) {
                                    let { rng, bInit } = PrepArea(srcElm, area, docVar.name);
                                    if (bInit) {
                                        let docEnv = CloneEnv(env);
                                        rng.value = {
                                            async render(W, args) {
                                                let svEnv = env, i = 0;
                                                env = docEnv;
                                                for (let lv of setVars)
                                                    lv(args[i++]);
                                                setWin(W);
                                                try {
                                                    await docBuilder.call(RC, { parent: W.document.body });
                                                }
                                                finally {
                                                    env = svEnv;
                                                }
                                            },
                                            open(target, features, ...args) {
                                                let W = w.open('', target, features), i = childWins.add(W);
                                                W.addEventListener('keydown', function (event) { if (event.key == 'Escape')
                                                    this.close(); });
                                                W.addEventListener('close', () => childWins.delete(W));
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
                                    }
                                    docVar(rng.value);
                                };
                                isBl = 1;
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
                                let { sub, bInit } = PrepArea(srcElm, area);
                                sub.parent = area.parent.ownerDocument.head;
                                sub.before = n;
                                await childBuilder.call(this, sub);
                                if (bInit)
                                    sub.prevR.newParent = sub.parent;
                            };
                            this.wspc = wspc;
                            isBl = 1;
                        }
                        break;
                    default:
                        bldr = await this.CompHTMLElement(srcElm, atts);
                        break;
                }
                atts.ChkNoAttsLeft();
            }
            for (let g of genMods)
                g.hndlr = this.CompHandler(g.attNm, g.txt);
        }
        catch (err) {
            throw OuterOpenTag(srcElm) + ' ' + err;
        }
        if (!bldr)
            return n;
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
                let r = area.rng;
                await b.call(this, area);
                for (let g of genMods) {
                    if (g.D && !r)
                        area.prevR.onDest = g.hndlr();
                    if (r ? g.U : g.C)
                        g.hndlr().call((r ? r.node : area.prevR?.node)
                            || area.parent);
                }
            };
        }
        if (dIf) {
            if (this.restoreActions.length > raLength)
                throw `'#IF' is not possible for declarations`;
            let b = bldr;
            bldr = function hif(area) {
                let c = dIf(), { sub } = PrepArea(srcElm, area, '', 1, !c);
                if (c)
                    return b.call(this, sub);
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
    GetREACT(srcElm, attName, builder, getRvars, bRenew) {
        let updateBuilder = (bRenew
            ? function renew(sub) {
                return builder.call(this, PrepArea(srcElm, sub, 'renew', 2).sub);
            }
            : /^this/.test(attName)
                ? function reacton(sub) {
                    sub.bRootOnly = 1;
                    return builder.call(this, sub);
                }
                : builder);
        async function REACT(area) {
            let rng, sub, bInit;
            ({ rng, sub, bInit } = PrepArea(srcElm, area, attName));
            area = sub;
            if (bRenew)
                area = PrepArea(srcElm, area, 'renew', 2).sub;
            await builder.call(this, area);
            if (getRvars) {
                let rvars = getRvars(), subs, pVars, i = 0;
                if (bInit)
                    subs = this.Subscriber(sub, updateBuilder, rng.child);
                else {
                    ({ subs, rvars: pVars } = rng);
                    assignEnv(subs.env, env);
                }
                rng.rvars = rvars;
                rng.subs = subs;
                for (let rvar of rvars) {
                    if (pVars) {
                        let pvar = pVars[i++];
                        if (rvar == pvar)
                            continue;
                        pvar._Subscribers.delete(subs);
                    }
                    try {
                        rvar.Subscribe(subs);
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
        let { rng } = area;
        if (rng && rng.errorNode) {
            area.parent.removeChild(rng.errorNode);
            rng.errorNode = u;
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
                let errNode = area.parent.insertBefore(createErrNode(message), area.rng?.FirstOrNext);
                if (rng)
                    rng.errorNode = errNode;
            }
        }
    }
    async CompScript(srcParent, srcElm, atts) {
        let { type, text, defer, async } = srcElm, src = atts.get('src'), defs = atts.get('defines'), bMod = /^module$|;\s*type\s*=\s*("?)module\1\s*$/i.test(type), bCls = /^((text|application)\/javascript)?$/i.test(type), mOto = /^otoreact(\/((local)|static))?\b/.exec(type), sLoc = mOto && mOto[2], bUpd = atts.getB('updating'), varlist = defs ? defs.split(',') : [], { context } = this, lvars = sLoc && this.NewVars(defs), exp, defNames = lvars ?
            function () {
                let i = 0;
                for (let lv of lvars)
                    lv(exp[i++]);
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
                    let { rng, bInit } = PrepArea(srcElm, area);
                    exp = bUpd || bInit ? rng.result = (await prom)(env) : rng.result;
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
    async CompFor(srcElm, atts) {
        let lvName = atts.get('let') ?? atts.get('var'), ixName = atts.get('index'), saved = this.SaveCont();
        if (ixName == '')
            ixName = 'index';
        try {
            if (lvName != n) {
                let prevNm = atts.get('previous'), nextNm = atts.get('next');
                if (prevNm == '')
                    prevNm = 'previous';
                if (nextNm == '')
                    nextNm = 'next';
                let getRange = this.CompAttrExpr(atts, 'of', 1), getUpdatesTo = this.CompAttrExpr(atts, 'updates'), bReacting = atts.getB('reacting') || atts.getB('reactive') || !!getUpdatesTo, loopVar = this.NewV(lvName), ixVar = this.NewV(ixName), prevVar = this.NewV(prevNm), nextVar = this.NewV(nextNm), getKey = this.CompAttrExpr(atts, 'key'), getHash = this.CompAttrExpr(atts, 'hash'), bodyBldr = await this.CompChildNodes(srcElm);
                return async function FOR(area) {
                    let { rng, sub } = PrepArea(srcElm, area, ''), { parent } = sub, before = sub.before !== u ? sub.before : rng.Next, iterable = getRange(), pIter = async (iter) => {
                        let svEnv = SaveEnv();
                        try {
                            let keyMap = rng.value || (rng.value = new Map()), newMap = new Map();
                            loopVar();
                            ixVar();
                            if (iter) {
                                if (!(iter[Symbol.iterator] || iter[Symbol.asyncIterator]))
                                    throw `[of]: Value (${iter}) is not iterable`;
                                let idx = 0;
                                for await (let item of iter) {
                                    this.SetVar(loopVar, item);
                                    this.SetVar(ixVar, idx);
                                    let hash = getHash && getHash(), key = getKey?.() ?? hash;
                                    if (key != null && newMap.has(key))
                                        throw `Key '${key}' is not unique`;
                                    newMap.set(key ?? {}, { item, hash, idx });
                                    idx++;
                                }
                            }
                            let nextChild = rng.child, iterator = newMap.entries(), nextIterator = nextNm ? newMap.values() : null, prevItem, nextItem, prevRange = null, childArea;
                            sub.parentR = rng;
                            prevVar();
                            nextVar();
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
                                    sub.rng = null;
                                    sub.prevR = prevRange;
                                    sub.before = nextChild?.FirstOrNext || before;
                                    ({ rng: childRange, sub: childArea } = PrepArea(null, sub, `${lvName}(${idx})`));
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
                                    childRange.text = `${lvName}(${idx})`;
                                    if (prevRange)
                                        prevRange.next = childRange;
                                    else
                                        rng.child = childRange;
                                    sub.rng = childRange;
                                    childArea = PrepArea(null, sub, '').sub;
                                    sub.parentR = null;
                                }
                                childRange.prev = prevRange;
                                prevRange = childRange;
                                if (hash == null
                                    || hash != childRange.hash
                                        && (childRange.hash = hash, 1)) {
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
                                    this.SetVar(loopVar, rvar || item);
                                    this.SetVar(ixVar, idx);
                                    this.SetVar(prevVar, prevItem);
                                    this.SetVar(nextVar, nextItem);
                                    await bodyBldr.call(this, childArea);
                                    if (rvar)
                                        if (childRange.rvar)
                                            assignEnv(childRange.iSub.env, env);
                                        else
                                            rvar.Subscribe(childRange.iSub = this.Subscriber(childArea, bodyBldr, childRange.child));
                                    childRange.rvar = rvar;
                                }
                                prevItem = item;
                            }
                            if (prevRange)
                                prevRange.next = null;
                            else
                                rng.child = null;
                        }
                        finally {
                            RestoreEnv(svEnv);
                        }
                    };
                    if (iterable instanceof Promise) {
                        let subEnv = { env: CloneEnv(env), onerr, onsucc }, rv = rng.rvar = RVAR(null, iterable, null, async () => {
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
                let nm = atts.get('of', 1, 1).toLowerCase(), slot = this.CSignatures.get(nm);
                if (!slot)
                    throw `Missing attribute [let]`;
                let ixVar = this.NewV(ixName), bodyBldr = await this.CompChildNodes(srcElm);
                return async function FOREACH_Slot(area) {
                    let { sub } = PrepArea(srcElm, area), saved = SaveEnv(), slotDef = env.constructs.get(nm);
                    ixVar();
                    try {
                        let idx = 0;
                        for (let slotBldr of slotDef.templates) {
                            this.SetVar(ixVar, idx++);
                            mapNm(env.constructs, { nm: nm, templates: [slotBldr], CEnv: slotDef.CEnv });
                            await bodyBldr.call(this, sub);
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
        let rv = atts.get('rvar'), varNm = rv || atts.get('let') || atts.get('var', 1), getVal = this.CompParam(atts, 'value') || dU, getStore = rv && this.CompAttrExpr(atts, 'store'), bReact = atts.getB('reacting') || atts.getB('updating'), lv = this.NewV(varNm);
        return [async function DEF(area) {
                let { rng, bInit } = PrepArea(srcElm, area);
                if (bInit || bReact) {
                    let v = getVal();
                    if (rv)
                        if (bInit)
                            rng.value = new _RVAR(this.RC, null, v, getStore && getStore(), `RVAR_${rv}`);
                        else
                            rng.value._Set(v);
                    else
                        rng.value = v;
                }
                lv(rng.value);
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
                            : m[3] ? /^on/.test(m[2]) ? () => _ => n : dU
                                : n
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
        let builders = [], bEncaps = atts.getB('encapsulate'), bRecurs = atts.getB('recursive'), styles = [], { wspc } = this, signats = [], elmTempl, bMultiple;
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
                case 'SIGNATURES':
                case 'SIGNATURE':
                    for (let elm of child.children)
                        signats.push(this.ParseSignat(elm));
                    break;
                case 'TEMPLATES':
                    bMultiple = 1;
                case 'TEMPLATE':
                    if (elmTempl)
                        throw 'Double <TEMPLATE>';
                    elmTempl = child;
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
            throw `Missing signature(s)`;
        if (!elmTempl)
            throw 'Missing template(s)';
        if (bRecurs)
            this.AddConstructs(signats);
        let mapS = new Map(signats.map(S => [S.nm, S])), templates = [];
        async function AddTemp(C, nm, prnt, elm) {
            let S = mapS.get(nm);
            if (!S)
                throw `<${nm}> has no signature`;
            templates.push({ nm, templates: [await C.CompTemplate(signats[0], prnt, elm, 0, bEncaps, styles)] });
            mapS.delete(nm);
        }
        if (bMultiple)
            for (let elm of elmTempl.children)
                await AddTemp(this, elm.localName, elm, elm);
        else
            await AddTemp(this, signats[0].nm, elmTempl.content, elmTempl);
        for (let nm of mapS.keys())
            throw `Signature <${nm}> has no template`;
        if (!bRecurs)
            this.AddConstructs(signats);
        this.wspc = wspc;
        return async function COMPONENT(area) {
            let constr = templates.map(C => ({ ...C }));
            if (bRecurs)
                constr.forEach(DefConstr);
            let saved = SaveEnv();
            try {
                for (let [bldr, srcNode] of builders)
                    await this.CallWithHandling(bldr, srcNode, area);
                let CEnv = CloneEnv(env);
                for (let c of constr)
                    c.CEnv = CEnv;
            }
            finally {
                RestoreEnv(saved);
            }
            if (!bRecurs)
                constr.forEach(DefConstr);
        };
    }
    async CompTemplate(signat, contentNode, srcElm, bNewNames, bEncaps, styles, atts) {
        let saved = this.SaveCont(), myAtts = atts || new Atts(srcElm), lvars = [];
        try {
            for (let { mode, nm } of signat.Params)
                lvars.push([nm, this.NewV((myAtts.get(mode + nm) ?? myAtts.get(nm, bNewNames)) || nm)]);
            this.AddConstructs(signat.Slots.values());
            if (!atts)
                myAtts.ChkNoAttsLeft();
            this.wspc = this.rspc = 1;
            let builder = await this.CompChildNodes(contentNode), { nm } = signat, customName = /^[A-Z].*-/.test(nm) ? nm : `rhtml-${nm}`;
            return async function TEMPLATE(area, args, mSlotTemplates, slotEnv) {
                let saved = SaveEnv(), i = 0;
                try {
                    for (let [nm, templates] of mSlotTemplates)
                        DefConstr({ nm, templates, CEnv: slotEnv });
                    for (let [nm, lv] of lvars) {
                        let arg = args[nm], dflt;
                        if (arg === u && (dflt = signat.Params[i]?.pDflt))
                            arg = dflt();
                        lv(arg);
                        i++;
                    }
                    if (bEncaps) {
                        let { rng: elmRange, childArea, bInit } = PrepElm(srcElm, area, customName), elm = elmRange.node, shadow = elm.shadowRoot || elm.attachShadow({ mode: 'open' });
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
        let { nm, RestParam } = signat, contSlot = signat.Slots.get('contents') || signat.Slots.get('content'), getArgs = [], slotBldrs = new Map();
        for (let nm of signat.Slots.keys())
            slotBldrs.set(nm, []);
        for (let { mode, nm, pDflt } of signat.Params)
            if (mode == '@') {
                let attVal = atts.get(mode + nm, !pDflt);
                getArgs.push(attVal
                    ? [nm, this.CompJScript(attVal, mode + nm),
                        this.CompJScript(`ORx=>{${attVal}=ORx}`, nm)
                    ]
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
                && (Slot = signat.Slots.get((slotElm = node).localName))) {
                slotBldrs.get(slotElm.localName).push(await this.CompTemplate(Slot, slotElm, slotElm, 1));
                srcElm.removeChild(node);
            }
        if (contSlot)
            slotBldrs.get(contSlot.nm).push(await this.CompTemplate(contSlot, srcElm, srcElm, 1, 0, n, atts));
        if (RestParam) {
            let modifs = this.CompAttribs(atts);
            getArgs.push([RestParam.nm,
                () => modifs.map(({ mt, nm, depV }) => ({ mt, nm, value: depV() }))]);
        }
        atts.ChkNoAttsLeft();
        this.wspc = 3;
        return async function INSTANCE(area) {
            let svEnv = env, cdef = env.constructs.get(nm), { rng, sub, bInit } = PrepArea(srcElm, area);
            if (!cdef)
                return;
            bReadOnly = 1;
            let args = rng.value || (rng.value = {});
            for (let [nm, dGet, dSet] of getArgs)
                if (!dSet)
                    args[nm] = dGet();
                else if (bInit)
                    args[nm] = RVAR('', dGet && dGet(), null, dSet());
                else if (dGet)
                    args[nm].V = dGet();
            bReadOnly = 0;
            env = cdef.CEnv;
            try {
                for (let { nm, pDflt } of signat.Params)
                    if (args[nm] === u)
                        args[nm] = pDflt();
                for (let template of cdef.templates)
                    await template.call(this, sub, args, slotBldrs, svEnv);
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
            let { rng: { node }, childArea, bInit } = PrepElm(srcElm, area, nm);
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
        function addM(mt, nm, depV) {
            if (mt == 1)
                nm = altProps[nm] || nm;
            modifs.push({ mt, nm, depV });
        }
        for (let [nm, V] of atts) {
            try {
                if (m = /(.*?)\.+$/.exec(nm))
                    addM(0, nm, this.CompString(V, nm));
                else if (m = /^on(.*?)\.*$/i.exec(nm))
                    addM(5, CapitalProp(m[0]), this.AddErrH(this.CompHandler(nm, V)));
                else if (m = /^#class[:.](.*)$/.exec(nm))
                    addM(3, m[1], this.CompJScript(V, nm));
                else if (m = /^#style\.(.*)$/.exec(nm))
                    addM(4, CapitalProp(m[1]), this.CompJScript(V, nm));
                else if (m = /^style\.(.*)$/.exec(nm))
                    addM(4, CapitalProp(m[1]), this.CompString(V, nm));
                else if (nm == '+style')
                    addM(6, nm, this.CompJScript(V, nm));
                else if (nm == "+class")
                    addM(7, nm, this.CompJScript(V, nm));
                else if (m = /^([\*\+#!]+|@@?)(.*?)\.*$/.exec(nm)) {
                    let m2 = CapitalProp(m[2]), setter;
                    if (m2 == 'class')
                        m2 = 'className';
                    try {
                        setter = m[1] == '#' ? n : this.CompJScript(`function(){let ORx=this.${m2};if(${V}!==ORx)${V}=ORx}`, nm);
                    }
                    catch (err) {
                        throw `Invalid left-hand side '${V}'`;
                    }
                    if (/[@#]/.test(m[1])) {
                        let depV = this.CompJScript(V, nm);
                        if (/^on/.test(m2))
                            addM(5, m2, this.AddErrH(depV));
                        else
                            addM(1, m2, depV);
                    }
                    if (/\*/.test(m[1]))
                        addM(9, 'oncreate', setter);
                    if (/\+/.test(m[1]))
                        addM(10, 'onupdate', setter);
                    if (/[@!]/.test(m[1]))
                        addM(5, /!!|@@/.test(m[1]) ? 'onchange' : 'oninput', setter);
                }
                else if (m = /^\.\.\.(.*)/.exec(nm)) {
                    if (V)
                        throw 'A rest parameter cannot have a value';
                    addM(8, nm, this.CompName(m[1]));
                }
                else if (nm == 'src')
                    addM(2, this.FilePath, this.CompString(V, nm));
                else
                    addM(0, nm, this.CompString(V, nm));
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
    }
    CompString(data, nm) {
        let regIS = this.regIS || (this.regIS = new RegExp(/(\\[${])|/.source
            + (this.Settings.bDollarRequired ? /\$/ : /\$?/).source
            + /\{((\{(\{.*?\}|.)*?\}|'(\\'|.)*?'|"(\\"|.)*?"|`(\\`|.)*?`|\\\}|.)*?)\}|$/.source, 'gs')), gens = [], ws = nm || this.Settings.bKeepWhiteSpace ? 4 : this.wspc, isTriv = 1, bThis, lastIndex = regIS.lastIndex = 0, dep, m;
        while (1)
            if (!(m = regIS.exec(data))[1]) {
                let fixed = lastIndex < m.index ? data.substring(lastIndex, m.index) : n;
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
                if (lastIndex == data.length)
                    break;
                if (m[2]) {
                    let getS = this.CompJScript(m[2], nm, '{}');
                    gens.push(getS);
                    isTriv = 0;
                    bThis || (bThis = getS.bThis);
                }
                lastIndex = regIS.lastIndex;
            }
        if (isTriv) {
            let s = gens.join('');
            (dep = () => s).fixed = s;
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
                    ? (lvars.push(this.NewV(m[1])), `(.*?)`)
                    : m[0] == '?' ? '.'
                        : m[0] == '*' ? '.*'
                            : m[2] ? m[2]
                                : m[0];
        }
        return { lvars, regex: new RegExp(`^${reg}$`, 'i'), url };
    }
    CompParam(atts, attName, bReq) {
        let v = atts.get(attName);
        return (v == n ? this.CompAttrExpr(atts, attName, bReq)
            : /^on/.test(attName) ? this.CompHandler(attName, v)
                : this.CompString(v, attName));
    }
    CompAttrExpr(atts, attName, bReq) {
        return this.CompJScript(atts.get(attName, bReq, 1), attName);
    }
    CompHandler(nm, text) {
        return /^#/.test(nm) ? this.CompJScript(text, nm)
            : this.CompJScript(`function(event){${text}\n}`, nm);
    }
    CompJScript(expr, descrip, delims = '""') {
        if (expr == n)
            return n;
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
        let list = atts.get(attName, 0, 1);
        if (!list)
            return n;
        if (bReacts)
            for (let nm of list.split(','))
                this.cRvars.set(nm.trim(), 0);
        return list ? this.CompJScript(`[${list}\n]`, attName) : n;
    }
    AddErrH(getHndlr) {
        return () => {
            let hndlr = getHndlr(), sErr = onerr, sSuc = onsucc;
            if (hndlr && (sErr || sSuc))
                return function hError(ev) {
                    try {
                        let r = hndlr.call(this, ev);
                        if (r instanceof Promise)
                            return r.then(v => (sSuc(ev), v), sErr);
                        if (sSuc)
                            sSuc(ev);
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
    async fetchModule(src, bInclHead) {
        let mod = document.getElementById(src);
        if (!mod) {
            let doc = parser.parseFromString(await this.FetchText(src), 'text/html');
            mod = doc.body;
            if (mod.firstElementChild.tagName == 'MODULE')
                mod = mod.firstElementChild;
            if (bInclHead)
                return concIterable(doc.head.childNodes, mod.childNodes);
        }
        return mod.childNodes;
    }
}
RCompiler.iNum = 0;
RCompiler.genAtts = /^#?(?:((?:this)?reacts?on)|on((?:create|update|destroy)+)|on((error)-?|success))$/;
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
    constructor(RC, name, initialValue, store, storeName) {
        this.RC = RC;
        this.name = name;
        this.store = store;
        this.storeName = storeName;
        this._Subscribers = new Set();
        if (name)
            globalThis[name] = this;
        let s = store && store.getItem(this._sNm);
        if (s != null)
            try {
                this._val = JSON.parse(s);
                return;
            }
            catch { }
        this._Set(initialValue);
    }
    get _sNm() { return this.storeName || `RVAR_${this.name}`; }
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
    get V() { return this._val; }
    set V(t) {
        if (t !== this._val) {
            this._val = t;
            this.SetDirty();
        }
    }
    _Set(t) {
        return t instanceof Promise ?
            ((this.V = u), t.then(v => (this.V = v), onerr))
            : (this.V = t);
    }
    get Set() {
        return this._Set.bind(this);
    }
    get Clear() {
        return () => { this.V = u; };
    }
    get U() {
        if (!bReadOnly)
            this.SetDirty();
        return this._val;
    }
    set U(t) { this._val = t; this.SetDirty(); }
    SetDirty() {
        this.RC.DirtyVars.add(this);
        for (let sub of this._Subscribers)
            if (sub.bImm)
                sub(this._val);
        this.RC.RUpdate();
    }
    Save() {
        this.store.setItem(this._sNm, JSON.stringify(this._val));
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
        let n = nm, v = super.get(n);
        if (v == null && bHashAllowed) {
            n = '#' + nm;
            v = super.get(n);
        }
        if (v != null)
            super.delete(n);
        else if (bRequired)
            throw `Missing attribute [${nm}]`;
        return v;
    }
    getB(nm) {
        let v = this.get(nm), m = /^((false)|true)?$/i.exec(v);
        if (v != n) {
            if (!m)
                throw `@${nm}: invalid value`;
            return !m[2];
        }
    }
    ChkNoAttsLeft() {
        if (super.size)
            throw `Unknown attribute${super.size > 1 ? 's' : ''}: ${Array.from(super.keys()).join(',')}`;
    }
}
let altProps = { "class": "className", valueAsNumber: "value" }, regIdent = /^[A-Za-z_$][A-Za-z0-9_$]*$/, regReserv = /^(?:break|case|catch|class|continue|debugger|default|delete|do|else|export|extends|finally|for|function|if|import|in|instanceof|new|return|super|switch|this|throw|try|typeof|var|void|while|with|enum|implements|interface|let|package|private|protected|public|static|yield|null|true|false)$/, words = 'access|active|align|animation|aria|as|backface|background|basis|blend|border|bottom|box|bounding|break|caption|caret|character|child|class|client|clip|column|(?:col|row)(?=span)|content|counter|css|decoration|default|design|document|element|empty|feature|fill|first|flex|font|form|get|grid|hanging|image|inner|input(?=mode)|^is|hanging|last|left|letter|line|list|margin|^max|^min|^nav|next|node|object|offset|outer|outline|overflow|owner|padding|page|parent|perspective|previous|ready?|right|size|rule|scroll|selected|selection|table|tab(?=index)|tag|text|top|transform|transition|unicode|user|validation|value|variant|vertical|white|will|word|^z', regCapit = new RegExp(`(html|uri)|(${words})|.`, "g");
function CheckIdentifier(nm) {
    if (!regIdent.test(nm))
        throw `Invalid identifier '${nm}'`;
    if (regReserv.test(nm))
        throw `Reserved keyword '${nm}'`;
    return nm;
}
function CapitalProp(lcName) {
    let bHadW;
    return lcName.replace(regCapit, (w, p1, p2) => {
        let r = p1 ? w.toUpperCase()
            : bHadW ? w.substring(0, 1).toUpperCase() + w.substring(1)
                : w;
        bHadW = p2;
        return r;
    });
}
function OuterOpenTag(elm, maxLen) {
    return Abbrev(/<.*?(?=>)/s.exec(elm.outerHTML)[0], maxLen - 1) + '>';
}
function Abbrev(s, maxLen) {
    return (maxLen && s.length > maxLen
        ? s.substring(0, maxLen - 3) + "..."
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
let _rng = globalThis.range = function* range(from, count, step = 1) {
    if (count === u) {
        count = from;
        from = 0;
    }
    for (let i = 0; i < count; i++)
        yield from + i * step;
};
globalThis.RCompile = RCompile;
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
export { _rng as range };
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
}, 1);
w.addEventListener('popstate', () => { docLocation.V = location.href; });
function ScrollToHash() {
    if (location.hash)
        setTimeout((() => document.getElementById(location.hash.substring(1))?.scrollIntoView()), 6);
}
setTimeout(() => /^rhtml$/i.test(document.body.getAttribute('type'))
    && RCompile(document.body), 0);
