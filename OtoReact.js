const U = undefined, N = null, T = true, F = false, W = window, defaultSettings = {
    bTiming: F,
    bAbortOnError: F,
    bShowErrors: T,
    bRunScripts: F,
    basePattern: '/',
    preformatted: [],
    bNoGlobals: F,
    bDollarRequired: F,
    bSetPointer: T,
    bKeepWhiteSpace: F,
    bKeepComments: F,
}, parser = new DOMParser(), gEval = eval, gFetch = fetch;
W.globalThis || (W.globalThis = W.self);
class Range {
    constructor(node, area, text) {
        this.text = text;
        this.node = node;
        if (area && !area.parentR?.node)
            this.parentR = area.parentR;
    }
    toString() { return this.text || this.node?.nodeName; }
    get First() {
        let f;
        if (f = this.node)
            return f;
        let ch = this.child;
        while (ch) {
            if (f = ch.First)
                return f;
            ch = ch.next;
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
            let c;
            if (r.node)
                yield r.node;
            else if (c = r.child)
                do {
                    yield* Nodes(c);
                } while (c = c.next);
        })(this);
    }
    erase(parent) {
        let { node, child: ch } = this;
        if (node && parent) {
            parent.removeChild(node);
            parent = N;
        }
        this.child = N;
        while (ch) {
            if (ch.bfDest)
                ch.bfDest.call(ch.node || parent);
            ch.erase(ch.parentN || parent);
            ch.parentR = N;
            if (ch.rvars)
                for (let rvar of ch.rvars)
                    rvar._Subscribers.delete(ch.subs);
            if (ch.onDest)
                ch.onDest.call(ch.node || parent);
            ch = ch.next;
        }
    }
}
let dU = () => U, dumB = async () => { };
function PrepArea(srcElm, area, text = '', nWipe, result) {
    let { parent, rng } = area, sub = { parent, rng: N }, bInit = !rng;
    if (bInit) {
        sub.source = area.source;
        sub.before = area.before;
        if (srcElm)
            text = srcElm.localName + (text && ' ') + text;
        UpdPrevRange(area, rng = sub.parentR = new Range(N, area, text));
        rng.result = result;
    }
    else {
        sub.rng = rng.child;
        area.rng = rng.next;
        if (nWipe && (nWipe == 2 || result != rng.result)) {
            rng.result = result;
            rng.erase(parent);
            sub.rng = N;
            sub.before = rng.Next;
            sub.parentR = rng;
            bInit = T;
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
            before: N,
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
        await R.Compile(elm);
        R.start = performance.now();
        builtNodeCnt = 0;
        let area = { parent: elm.parentElement, source: elm, rng: N };
        await R.Build(area);
        W.addEventListener('pagehide', () => childWins.forEach(w => w.close()));
        R.logTime(`${R.num}: Built ${builtNodeCnt} nodes in ${(performance.now() - R.start).toFixed(1)} ms`);
        ScrollToHash();
    }
    catch (err) {
        alert(`OtoReact error: ` + err);
    }
}
function NewEnv() {
    let e = [];
    e.cdefs = new Map();
    return e;
}
function CloneEnv(env) {
    let e = Object.assign([], env);
    e.cdefs = new Map(env.cdefs);
    return e;
}
function assignEnv(target, source) {
    let C = target.cdefs;
    Object.assign(target, source).cdefs = C;
}
function UpdVar(lv, v) {
    lv(v, T);
}
class Signature {
    constructor(srcElm, bIsSlot) {
        this.srcElm = srcElm;
        this.bIsSlot = bIsSlot;
        this.Params = [];
        this.RestParam = N;
        this.Slots = new Map();
        this.nm = srcElm.localName;
    }
    IsCompatible(sig) {
        if (!sig)
            return;
        let r = T, mapSigParams = new Map(sig.Params.map(p => [p.nm, !!p.pDflt]));
        for (let { nm, pDflt } of this.Params)
            if (mapSigParams.has(nm)) {
                r && (r = !pDflt || mapSigParams.get(nm));
                mapSigParams.delete(nm);
            }
            else
                r = F;
        for (let pDflt of mapSigParams.values())
            r && (r = pDflt);
        for (let [nm, slotSig] of this.Slots)
            r && (r = sig.Slots.get(nm)?.IsCompatible(slotSig));
        return r;
    }
}
class _RVAR {
    constructor(RC, name, initialValue, store, storeName) {
        this.RC = RC;
        this.name = name;
        this.store = store;
        this.storeName = storeName;
        this._val = U;
        this._Subscribers = new Set();
        if (name)
            globalThis[name] = this;
        let s = store && store.getItem(this._sNm), t = initialValue;
        if (s != N)
            try {
                this._val = JSON.parse(s);
                return;
            }
            catch { }
        t instanceof Promise ?
            t.then(v => (this.V = v), onerr)
            : (this._val = t);
    }
    get _sNm() { return this.storeName || `RVAR_${this.name}`; }
    Subscribe(s, bImmediate, bInit = bImmediate) {
        if (bInit)
            s(this._val);
        s.bImm = bImmediate;
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
            ((this.V = U), t.then(v => (this.V = v), onerr))
            : (this.V = t);
    }
    get Set() {
        return this._Set.bind(this);
    }
    get Clear() {
        return () => { this.V = U; };
    }
    get U() {
        if (!bRO)
            this.SetDirty();
        return this._val;
    }
    set U(t) { this._val = t; this.SetDirty(); }
    SetDirty() {
        let b;
        for (let sub of this._Subscribers)
            if (sub.bImm)
                sub(this._val);
            else
                b = T;
        if (b || this.store) {
            this.RC.DirtyVars.add(this);
            this.RC.RUpdate();
        }
    }
    Save() {
        this.store.setItem(this._sNm, JSON.stringify(this._val));
    }
    toString() {
        return this._val.toString();
    }
}
let bRO = F;
function ApplyMod(elm, M, val, bCr) {
    let { mt, nm, cnm } = M;
    function checkNm() {
        if (!cnm)
            M.cnm = M.nm = nm = CheckNm(elm, nm);
    }
    switch (mt) {
        case 0:
            elm.setAttribute(nm, val);
            break;
        case 2:
            elm.setAttribute('src', new URL(val, nm).href);
            break;
        case 1:
            checkNm();
            if (val === U && typeof elm[nm] == 'string')
                val = '';
            if (val !== elm[nm])
                elm[nm] = val;
            break;
        case 5:
            checkNm();
            let m;
            if (val)
                if (m = /^on(input|change)$/.exec(nm)) {
                    elm.addEventListener(m[1], val);
                    elm.handlers.push({ evType: m[1], listener: val });
                }
                else {
                    elm[nm] = val;
                    if (nm == 'onclick' && R.Settings.bSetPointer)
                        elm.style.cursor = val && !elm.disabled ? 'pointer' : N;
                }
            break;
        case 3:
            if (val)
                elm.classList.add(nm);
            break;
        case 4:
            elm.style[nm] = val || (val === 0 ? '0' : N);
            break;
        case 6:
            if (val)
                for (let [nm, v] of Object.entries(val))
                    elm.style[nm] = v || (v === 0 ? '0' : N);
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
            for (let { M, value } of val || [])
                ApplyMod(elm, M, value, bCr);
            break;
        case 9:
            if (bCr)
                val.call(elm);
        case 10:
            if (!bCr)
                val.call(elm);
            break;
    }
}
function ApplyMods(elm, modifs, bCreate) {
    bRO = T;
    for (let M of modifs)
        try {
            let { depV } = M, value = depV.bThis ? depV.call(elm) : depV();
            ApplyMod(elm, M, value, bCreate);
        }
        catch (err) {
            throw `[${M.nm}]: ${err}`;
        }
    bRO = F;
}
let RModules = new Map(), env, onerr, onsucc, builtNodeCnt = 0, envActions = [];
function SaveEnv() {
    return envActions.length;
}
function RestEnv(savedEnv) {
    for (let j = envActions.length; j > savedEnv; j--)
        envActions.pop()();
}
function DefConstr(c) {
    let C = env.cdefs;
    if (C.has(c.nm)) {
        let e = env;
        envActions.push(() => env = e);
        C = (env = CloneEnv(env)).cdefs;
    }
    else
        envActions.push(() => C.delete(c.nm));
    mapNm(C, c);
}
let updCnt = 0;
class RCompiler {
    constructor(RC, FilePath, bClr) {
        this.num = RCompiler.iNum++;
        this.cRvars = new Map();
        this.restoreActions = [];
        this.mPreformatted = new Set(['pre']);
        this.wspc = 1;
        this.rspc = T;
        this.DirtyVars = new Set();
        this.hUpdate = N;
        this.srcNodeCnt = 0;
        this.Settings = RC ? { ...RC.Settings } : { ...defaultSettings };
        this.RC = RC || (RC = this);
        this.FilePath = FilePath || RC.FilePath;
        this.doc = RC.doc || document;
        this.head = RC.head || this.doc.head;
        if (bClr)
            RC = this;
        this.ctxStr = RC?.ctxStr || ",";
        this.ctxMap = RC ? new Map(RC.ctxMap) : new Map();
        this.ctxLen = RC?.ctxLen || 1;
        this.CSignats = RC ? new Map(RC.CSignats) : new Map();
        this.StyleBefore = RC.StyleBefore;
    }
    SaveCont() {
        return this.restoreActions.length;
    }
    RestoreCont(sv) {
        for (let j = this.restoreActions.length; j > sv; j--)
            this.restoreActions.pop()();
    }
    newV(nm) {
        let lv;
        if (!(nm = nm?.trim()))
            lv = dU;
        else {
            let { ctxStr, ctxLen, ctxMap } = this, i = ctxMap.get(CheckId(nm));
            this.restoreActions.push(() => {
                this.ctxStr = ctxStr;
                this.ctxLen--;
                mapSet(ctxMap, nm, i);
            });
            this.ctxStr = ctxStr.replace(`,${nm},`, ',,') + nm + ',';
            ctxMap.set(nm, this.ctxLen++);
            lv =
                ((v, bUpd) => {
                    if (!bUpd)
                        envActions.push(() => env.pop());
                    env[ctxLen] = v;
                });
        }
        lv.nm = nm;
        return lv;
    }
    NewVars(varlist) {
        return Array.from(split(varlist), nm => this.newV(nm));
    }
    AddConstructs(listS) {
        for (let S of listS) {
            let savedC = this.CSignats.get(S.nm);
            mapNm(this.CSignats, S);
            this.restoreActions.push(() => mapSet(this.CSignats, S.nm, savedC));
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
                : (await this.CompElm(elm.parentElement, elm, T))[0];
            this.bCompiled = T;
        }
        finally {
            R = savedR;
        }
        this.logTime(`Compiled ${this.srcNodeCnt} nodes in ${(performance.now() - t0).toFixed(1)} ms`);
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
                this.hUpdate = N;
                this.DoUpdate();
            }, 5);
    }
    async DoUpdate() {
        if (!this.bCompiled || this.bUpdating)
            return;
        this.bUpdating = T;
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
                                await subs(rv instanceof _RVAR ? rv.V : rv);
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
            this.bUpdating = F;
        }
    }
    RVAR(nm, value, store, subs, storeName) {
        let r = new _RVAR(this.RC, nm, value, store, storeName);
        if (subs)
            r.Subscribe(subs, T, F);
        return r;
    }
    RVAR_Light(t, updatesTo) {
        if (!t._Subscribers) {
            t._Subscribers = new Set();
            t._UpdatesTo = updatesTo;
            let { RC } = this;
            Object.defineProperty(t, 'U', { get: () => {
                    if (!bRO) {
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
                        RestEnv(savEnv);
                    }
                }
                : dumB;
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
                    this.srcNodeCnt++;
                    bldr = await this.CompElm(srcParent, srcNode);
                    break;
                case Node.TEXT_NODE:
                    this.srcNodeCnt++;
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
                            [async (area) => PrepCharData(area, getText(), T), srcNode, 1];
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
                if (isB === T)
                    builders.splice(i, 1);
        }
        if (rspc)
            prune();
        if (!builders.length)
            return N;
        return addP(async function Iter(area, start = 0) {
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
                        (sArea.rng = r.next).updated = updCnt;
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
        }, "ws", builders[0][0].ws);
    }
    async CompElm(srcPrnt, srcElm, bUnhide) {
        let atts = new Atts(srcElm), cl = this.ctxLen, reacts = [], before = [], after = [], anyH, dIf, raLength = this.restoreActions.length, depOnerr, depOnsucc, bldr, elmBldr, isBl, m, nm;
        if (bUnhide)
            atts.set('#hidden', 'false');
        try {
            dIf = this.CompAttrExpr(atts, 'if');
            for (let attNm of atts.keys())
                if (m = genAtts.exec(attNm))
                    if (m[1])
                        reacts.push({ attNm, rvars: this.compAttrExprList(atts, attNm, T) });
                    else {
                        let txt = atts.get(attNm);
                        if (nm = m[3])
                            (m[2] ? before : after).push({ attNm, txt, C: /c/i.test(nm), U: /u/i.test(nm), D: /y/i.test(nm) });
                        else {
                            let hndlr = this.CompHandler(attNm, txt);
                            if (m[5])
                                (depOnerr = hndlr).bBldr = !/-$/.test(attNm);
                            else
                                depOnsucc = hndlr;
                        }
                    }
            let constr = this.CSignats.get(srcElm.localName);
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
                                this.cRvars.set(rv, T);
                                this.restoreActions.push(() => {
                                    if (elmBldr)
                                        elmBldr.auto = this.cRvars.get(rv);
                                    this.cRvars.set(rv, a);
                                });
                            }
                            isBl = T;
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
                                            bThen = T;
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
                            let caseList = [], { wspc, rspc } = this, postWs = 0;
                            for (let { node, atts, body } of caseNodes) {
                                let saved = this.SaveCont();
                                this.wspc = wspc;
                                this.rspc = rspc;
                                try {
                                    let cond, not = T, patt, p;
                                    switch (node.nodeName) {
                                        case 'IF':
                                        case 'THEN':
                                        case 'WHEN':
                                            cond = this.CompAttrExpr(atts, 'cond');
                                            not = !atts.getB('not');
                                            patt =
                                                (p = atts.get('match')) != N
                                                    ? this.CompPattern(p)
                                                    : (p = atts.get('urlmatch')) != N
                                                        ? this.CompPattern(p, T)
                                                        : (p = atts.get('regmatch')) != N
                                                            ? { regex: new RegExp(p, 'i'),
                                                                lvars: this.NewVars(atts.get('captures'))
                                                            }
                                                            : N;
                                            if (bHiding && patt?.lvars.length)
                                                throw `Pattern capturing cannot be combined with hiding`;
                                            if (patt && !getVal)
                                                throw `Match requested but no 'value' specified.`;
                                        case 'ELSE':
                                            caseList.push({
                                                cond, not, patt,
                                                bldr: await this.CompChildNodes(node, body),
                                                node
                                            });
                                            atts.ChkNoAttsLeft();
                                            postWs = Math.max(postWs, this.wspc);
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
                            this.wspc = postWs;
                            bldr =
                                async function CASE(area) {
                                    let value = getVal && getVal(), choosenAlt = N, matchResult;
                                    for (let alt of caseList)
                                        try {
                                            if (!((!alt.cond || alt.cond())
                                                && (!alt.patt || value != N && (matchResult = alt.patt.regex.exec(value)))) != alt.not) {
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
                                                RestEnv(saved);
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
                        if (srcElm.children.length || srcElm.textContent.trim()) {
                            atts.get('src');
                            bldr = await this.CompChildNodes(srcElm);
                        }
                        else {
                            let src = atts.get('src', T), C = new RCompiler(this, this.GetPath(src)), task = (async () => {
                                await C.Compile(N, { bRunScripts: T }, await this.fetchModule(src));
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
                            let src = atts.get('src', T), bIncl = atts.getB('include'), vars = this.NewVars(atts.get('defines')), bAsync = atts.getB('async'), listImports = new Array(), promModule = RModules.get(src);
                            for (let ch of srcElm.children) {
                                let sign = this.ParseSignat(ch);
                                listImports.push(sign);
                            }
                            this.AddConstructs(listImports);
                            if (!promModule) {
                                let C = new RCompiler(this, this.GetPath(src), T);
                                C.Settings.bRunScripts = T;
                                promModule = this.fetchModule(src).then(async (nodes) => {
                                    let bldr = (await C.CompIter(N, nodes)) || dumB;
                                    for (let clientSig of listImports) {
                                        let signat = C.CSignats.get(clientSig.nm);
                                        if (!signat)
                                            throw `<${clientSig.nm}> is missing in '${src}'`;
                                        if (bAsync && !clientSig.IsCompatible(signat))
                                            throw `Import signature ${clientSig.srcElm.outerHTML} is incompatible with module signature ${signat.srcElm.outerHTML}`;
                                    }
                                    for (let v of vars)
                                        if (!(v.i = C.ctxMap.get(v.nm)))
                                            throw `Module does not define '${v.nm}'`;
                                    return [bldr.bind(C), C.CSignats];
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
                                    DefConstr(MEnv.cdefs.get(nm));
                                for (let lv of vars)
                                    lv(MEnv[lv.i]);
                            };
                            isBl = T;
                        }
                        break;
                    case 'react':
                        {
                            let getRvars = this.compAttrExprList(atts, 'on', T), getHashes = this.compAttrExprList(atts, 'hash'), bodyBuilder = await this.CompChildNodes(srcElm);
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
                            let getSrctext = this.CompParam(atts, 'srctext', T), modifs = this.CompAttribs(atts);
                            this.wspc = 1;
                            bldr = async function RHTML(area) {
                                let srctext = getSrctext(), { rng, bInit } = PrepElm(srcElm, area, 'rhtml-rhtml'), { node } = rng;
                                ApplyMods(node, modifs, bInit);
                                if (area.prevR || srctext != rng.result) {
                                    rng.result = srctext;
                                    let svEnv = env, R = new RCompiler(N, this.FilePath), sRoot = R.head = node.shadowRoot || node.attachShadow({ mode: 'open' }), tempElm = document.createElement('rhtml'), sArea = { parent: sRoot, rng: N, parentR: rng.child || (rng.child = new Range(N, N, 'Shadow')) };
                                    rng.child.erase(sRoot);
                                    sRoot.innerHTML = '';
                                    try {
                                        tempElm.innerHTML = srctext;
                                        await R.Compile(tempElm, { bRunScripts: T, bTiming: this.Settings.bTiming }, tempElm.childNodes);
                                        await R.Build(sArea);
                                    }
                                    catch (err) {
                                        sRoot.appendChild(createErrNode(`Compile error: ` + err));
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
                        isBl = T;
                        break;
                    case 'style':
                        this.CompStyle(srcElm);
                        isBl = T;
                        break;
                    case 'component':
                        bldr = await this.CompComponent(srcElm, atts);
                        isBl = T;
                        break;
                    case 'document':
                        {
                            let docVar = this.newV(atts.get('name', T)), RC = new RCompiler(this), bEncaps = atts.getB('encapsulate'), setVars = RC.NewVars(atts.get('params')), winV = RC.newV(atts.get('window')), docBldr = ((RC.head = document.createElement('DocumentFragment')), await RC.CompChildNodes(srcElm));
                            bldr = async function DOCUMENT(area) {
                                let { rng, bInit } = PrepArea(srcElm, area, docVar.name);
                                if (bInit) {
                                    let doc = area.parent.ownerDocument, docEnv = CloneEnv(env), wins = rng.wins = new Set();
                                    rng.value = {
                                        async render(w, bInit, args) {
                                            let svEnv = env, i = 0, D = w.document;
                                            env = docEnv;
                                            for (let lv of setVars)
                                                lv(args[i++]);
                                            winV(w);
                                            try {
                                                if (bInit) {
                                                    if (!bEncaps)
                                                        copyStyleSheets(doc, D);
                                                    for (let S of RC.head.childNodes)
                                                        D.head.append(S.cloneNode(T));
                                                }
                                                let area = { parent: D.body, rng: w.rng };
                                                await docBldr.call(RC, area);
                                            }
                                            finally {
                                                env = svEnv;
                                            }
                                        },
                                        open(target, features, ...args) {
                                            let w = W.open('', target || '', features), bInit = !childWins.has(w);
                                            if (bInit) {
                                                w.addEventListener('keydown', function (event) { if (event.key == 'Escape')
                                                    this.close(); });
                                                w.addEventListener('close', () => childWins.delete(w), wins.delete(w));
                                                childWins.add(w);
                                                wins.add(w);
                                            }
                                            else
                                                w.document.body.innerHTML = '';
                                            this.render(w, bInit, args);
                                            return w;
                                        },
                                        async print(...args) {
                                            let iframe = doc.createElement('iframe');
                                            iframe.hidden = T;
                                            doc.body.appendChild(iframe);
                                            await this.render(iframe.contentWindow, T, args);
                                            iframe.contentWindow.print();
                                            iframe.remove();
                                        },
                                        closeAll: () => {
                                            for (let w of wins)
                                                w.close();
                                        }
                                    };
                                }
                                docVar(rng.value);
                            };
                            isBl = T;
                        }
                        break;
                    case 'rhead':
                        {
                            let childBuilder = await this.CompChildNodes(srcElm), { wspc } = this;
                            this.wspc = this.rspc = 1;
                            bldr = async function HEAD(area) {
                                let { sub } = PrepArea(srcElm, area);
                                sub.parent = area.parent.ownerDocument.head;
                                sub.before = N;
                                await childBuilder.call(this, sub);
                                if (sub.prevR)
                                    sub.prevR.parentN = sub.parent;
                            };
                            this.wspc = wspc;
                            isBl = T;
                        }
                        break;
                    default:
                        bldr = await this.CompHTMLElement(srcElm, atts);
                        break;
                }
                atts.ChkNoAttsLeft();
            }
            for (let g of concIter(before, after))
                anyH = g.hndlr = this.CompHandler(g.attNm, g.txt);
        }
        catch (err) {
            throw OuterOpenTag(srcElm) + ' ' + err;
        }
        if (!bldr)
            return N;
        let { ws } = bldr;
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
        if (anyH) {
            let b = bldr;
            bldr = async function ON(area) {
                let r = area.rng, bfD;
                for (let g of before) {
                    if (g.D && !r)
                        bfD = g.hndlr();
                    if (r ? g.U : g.C)
                        g.hndlr().call(r && r.node || area.parent);
                }
                await b.call(this, area);
                if (bfD)
                    area.prevR.bfDest = bfD;
                for (let g of after) {
                    if (g.D && !r)
                        area.prevR.onDest = g.hndlr();
                    if (r ? g.U : g.C)
                        g.hndlr().call((r ? r.node : area.prevR?.node) || area.parent);
                }
            };
        }
        if (dIf) {
            if (this.restoreActions.length > raLength)
                throw `'#IF' is not possible for declarations`;
            let b = bldr;
            bldr = function hif(area) {
                let c = dIf(), { sub } = PrepArea(srcElm, area, '#if', 1, !c);
                if (c)
                    return b.call(this, sub);
            };
        }
        for (let { attNm, rvars } of reacts)
            bldr = this.GetREACT(srcElm, attNm, bldr, rvars);
        return [elmBldr = addP(this.ctxLen == cl
                ? function Elm(area) {
                    return this.CallWithHandling(bldr, srcElm, area);
                }
                : function Elm(area) {
                    return bldr.call(this, area).catch((err) => { throw `${OuterOpenTag(srcElm, 40)} ${err}`; });
                }, 'ws', ws), srcElm];
    }
    GetREACT(srcElm, attName, builder, getRvars, bRenew) {
        let updateBuilder = (bRenew
            ? function renew(sub) {
                return builder.call(this, PrepArea(srcElm, sub, 'renew', 2).sub);
            }
            : /^this/.test(attName)
                ? function reacton(sub) {
                    sub.bRootOnly = T;
                    return builder.call(this, sub);
                }
                : builder);
        return addP(async function REACT(area) {
            let { rng, sub, bInit } = PrepArea(srcElm, area, attName);
            await builder.call(this, bRenew ? PrepArea(srcElm, sub, 'renew', 2).sub : sub);
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
        }, "ws", builder.ws);
    }
    async CallWithHandling(builder, srcNode, area) {
        let { rng } = area;
        if (rng && rng.errNode) {
            area.parent.removeChild(rng.errNode);
            rng.errNode = U;
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
                    rng.errNode = errNode;
            }
        }
    }
    async CompScript(srcParent, srcElm, atts) {
        let { type, text, defer, async } = srcElm, src = atts.get('src'), defs = atts.get('defines'), bMod = /^module$|;\s*type\s*=\s*("?)module\1\s*$/i.test(type), bCls = /^((text|application)\/javascript)?$/i.test(type), mOto = /^otoreact(\/((local)|static))?\b/.exec(type), sLoc = mOto && mOto[2], bUpd = atts.getB('updating'), varlist = [...split(defs)], { ctxStr: context } = this, lvars = sLoc && this.NewVars(defs), exp, defNames = lvars ?
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
                    : import(src = URL.createObjectURL(new Blob([text.replace(/(\bimport\s(?:(?:\{.*?\}|\s|[a-zA-Z0-9_,*])*\sfrom)?\s*['"])([^'"]*)(['"])/g, (_, p1, p2, p3) => `${p1}${this.GetURL(p2)}${p3}`)], { type: 'text/javascript' }))).finally(() => URL.revokeObjectURL(src));
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
            if (lvName != N) {
                let prevNm = atts.get('previous'), nextNm = atts.get('next');
                if (prevNm == '')
                    prevNm = 'previous';
                if (nextNm == '')
                    nextNm = 'next';
                let getRange = this.CompAttrExpr(atts, 'of', T), getUpdatesTo = this.CompAttrExpr(atts, 'updates'), bReact = atts.getB('reacting') || atts.getB('reactive') || !!getUpdatesTo, loopVar = this.newV(lvName), ixVar = this.newV(ixName), prevVar = this.newV(prevNm), nextVar = this.newV(nextNm), getKey = this.CompAttrExpr(atts, 'key'), getHash = this.CompAttrExpr(atts, 'hash'), bodyBldr = await this.CompChildNodes(srcElm);
                return async function FOR(area) {
                    let { rng, sub } = PrepArea(srcElm, area, ''), { parent } = sub, before = sub.before !== U ? sub.before : rng.Next, iterable = getRange(), pIter = async (iter) => {
                        let svEnv = SaveEnv();
                        try {
                            let keyMap = rng.value || (rng.value = new Map()), newMap = new Map();
                            loopVar();
                            ixVar();
                            if (iter) {
                                if (!(Symbol.iterator in iter || Symbol.asyncIterator in iter))
                                    throw `[of]: Value (${iter}) is not iterable`;
                                let idx = 0;
                                for await (let item of iter) {
                                    UpdVar(loopVar, item);
                                    UpdVar(ixVar, idx);
                                    let hash = getHash && getHash(), key = getKey?.() ?? hash;
                                    if (key != N && newMap.has(key))
                                        throw `Key '${key}' is not unique`;
                                    newMap.set(key ?? {}, { item, hash, idx });
                                    idx++;
                                }
                            }
                            let nxChld = rng.child, iterator = newMap.entries(), nextIter = nextNm ? newMap.values() : N, prevItem, nextItem, prevRange = N, childArea;
                            sub.parentR = rng;
                            prevVar();
                            nextVar();
                            if (nextIter)
                                nextIter.next();
                            while (T) {
                                let k, nx = iterator.next();
                                while (nxChld && !newMap.has(k = nxChld.key)) {
                                    if (k != N)
                                        keyMap.delete(k);
                                    nxChld.erase(parent);
                                    if (nxChld.subs)
                                        nxChld.rvars[0]._Subscribers.delete(nxChld.subs);
                                    nxChld.prev = N;
                                    nxChld = nxChld.next;
                                }
                                if (nx.done)
                                    break;
                                let [key, { item, hash, idx }] = nx.value, childRange = keyMap.get(key), bInit = !childRange;
                                if (nextIter)
                                    nextItem = nextIter.next().value?.item;
                                if (bInit) {
                                    sub.rng = N;
                                    sub.prevR = prevRange;
                                    sub.before = nxChld?.FirstOrNext || before;
                                    ({ rng: childRange, sub: childArea } = PrepArea(N, sub, `${lvName}(${idx})`));
                                    if (key != N) {
                                        if (keyMap.has(key))
                                            throw `Duplicate key '${key}'`;
                                        keyMap.set(key, childRange);
                                    }
                                    childRange.key = key;
                                }
                                else {
                                    if (childRange.fragm) {
                                        parent.insertBefore(childRange.fragm, nxChld?.FirstOrNext || before);
                                        childRange.fragm = N;
                                    }
                                    else
                                        while (T) {
                                            if (nxChld == childRange)
                                                nxChld = nxChld.next;
                                            else {
                                                if (newMap.get(nxChld.key)?.idx > idx + 2) {
                                                    let fragm = nxChld.fragm = document.createDocumentFragment();
                                                    for (let node of nxChld.Nodes())
                                                        fragm.appendChild(node);
                                                    nxChld = nxChld.next;
                                                    continue;
                                                }
                                                childRange.prev.next = childRange.next;
                                                if (childRange.next)
                                                    childRange.next.prev = childRange.prev;
                                                let nextNode = nxChld?.FirstOrNext || before;
                                                for (let node of childRange.Nodes())
                                                    parent.insertBefore(node, nextNode);
                                            }
                                            break;
                                        }
                                    childRange.next = nxChld;
                                    childRange.text = `${lvName}(${idx})`;
                                    if (prevRange)
                                        prevRange.next = childRange;
                                    else
                                        rng.child = childRange;
                                    sub.rng = childRange;
                                    childArea = PrepArea(N, sub, '').sub;
                                    sub.parentR = N;
                                }
                                childRange.prev = prevRange;
                                prevRange = childRange;
                                if (hash == N
                                    || hash != childRange.hash
                                        && (childRange.hash = hash, T)) {
                                    if (bReact && (bInit || item != childRange.rvars[0])) {
                                        this.RVAR_Light(item, getUpdatesTo && [getUpdatesTo()]);
                                        if (childRange.subs)
                                            item._Subscribers = childRange.rvars[0]._Subscribers;
                                    }
                                    UpdVar(loopVar, item);
                                    UpdVar(ixVar, idx);
                                    UpdVar(prevVar, prevItem);
                                    UpdVar(nextVar, nextItem);
                                    await bodyBldr.call(this, childArea);
                                    if (bReact)
                                        if (childRange.subs)
                                            assignEnv(childRange.subs.env, env);
                                        else {
                                            item.Subscribe(childRange.subs = this.Subscriber(childArea, bodyBldr, childRange.child));
                                            childRange.rvars = [item];
                                        }
                                }
                                prevItem = item;
                            }
                            if (prevRange)
                                prevRange.next = N;
                            else
                                rng.child = N;
                        }
                        finally {
                            RestEnv(svEnv);
                        }
                    };
                    if (iterable instanceof Promise) {
                        let subEnv = { env: CloneEnv(env), onerr, onsucc };
                        rng.rvars = [RVAR(N, iterable, N, rng.subs =
                                async (iter) => {
                                    let save = { env, onerr, onsucc };
                                    ({ env, onerr, onsucc } = subEnv);
                                    try {
                                        await pIter(iter);
                                    }
                                    finally {
                                        ({ env, onerr, onsucc } = save);
                                    }
                                })];
                    }
                    else
                        await pIter(iterable);
                };
            }
            else {
                let nm = atts.get('of', T, T).toLowerCase();
                if (!this.CSignats.get(nm))
                    throw `Missing attribute [let]`;
                let ixVar = this.newV(ixName), bodyBldr = await this.CompChildNodes(srcElm);
                return async function FOREACH_Slot(area) {
                    let { sub } = PrepArea(srcElm, area), saved = SaveEnv(), slotDef = env.cdefs.get(nm);
                    ixVar();
                    try {
                        let idx = 0;
                        for (let slotBldr of slotDef.templates) {
                            UpdVar(ixVar, idx++);
                            mapNm(env.cdefs, { nm: nm, templates: [slotBldr], CEnv: slotDef.CEnv });
                            await bodyBldr.call(this, sub);
                        }
                    }
                    finally {
                        mapNm(env.cdefs, slotDef);
                        RestEnv(saved);
                    }
                };
            }
        }
        finally {
            this.RestoreCont(saved);
        }
    }
    CompDefine(srcElm, atts) {
        if (srcElm.childElementCount)
            throw `<${srcElm.localName} ...> must be followed by </${srcElm.localName}>`;
        let rv = atts.get('rvar'), varNm = rv || atts.get('let') || atts.get('var', T), getVal = this.CompParam(atts, 'value') || dU, getStore = rv && this.CompAttrExpr(atts, 'store'), bReact = atts.getB('reacting') || atts.getB('updating'), lv = this.newV(varNm);
        return [async function DEF(area) {
                let { rng, bInit } = PrepArea(srcElm, area);
                if (bInit || bReact) {
                    let v = getVal();
                    if (rv)
                        if (bInit)
                            rng.value = new _RVAR(this.RC, N, v, getStore && getStore(), `RVAR_${rv}`);
                        else
                            rng.value._Set(v);
                    else
                        rng.value = v;
                }
                lv(rng.value);
            }, rv];
    }
    ParseSignat(elmSignat, bIsSlot) {
        let signat = new Signature(elmSignat, bIsSlot);
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
                            : m[3] ? /^on/.test(m[2]) ? () => _ => N : dU
                                : N
                };
                signat.Params.push(param);
                if (m[1] == '...')
                    signat.RestParam = param;
            }
        }
        for (let elmSlot of elmSignat.children)
            mapNm(signat.Slots, this.ParseSignat(elmSlot, T));
        return signat;
    }
    async CompComponent(srcElm, atts) {
        let bldr, bRecurs = atts.getB('recursive'), { wspc } = this, signats = [], templates = [], { head } = this, encStyles = atts.getB('encapsulate') && (this.head = srcElm.ownerDocument.createDocumentFragment()).children, save = this.SaveCont();
        try {
            let arr = Array.from(srcElm.children), elmSign = arr.shift(), elmTempl = arr.pop();
            if (!elmSign)
                throw 'Missing signature(s)';
            if (!elmTempl || !/^TEMPLATES?$/.test(elmTempl.nodeName))
                throw 'Missing template(s)';
            for (let elm of /^SIGNATURES?$/.test(elmSign.nodeName) ? elmSign.children : [elmSign])
                signats.push(this.ParseSignat(elm));
            if (bRecurs)
                this.AddConstructs(signats);
            bldr = await this.CompIter(srcElm, arr);
            let mapS = new Map(signats.map(S => [S.nm, S]));
            async function AddTemp(RC, nm, prnt, elm) {
                let S = mapS.get(nm);
                if (!S)
                    throw `<${nm}> has no signature`;
                templates.push({ nm, templates: [await RC.CompTempl(S, prnt, elm, F, encStyles)] });
                mapS.delete(nm);
            }
            if (/S/.test(elmTempl.nodeName))
                for (let elm of elmTempl.children)
                    await AddTemp(this, elm.localName, elm, elm);
            else
                await AddTemp(this, signats[0].nm, elmTempl.content, elmTempl);
            for (let nm of mapS.keys())
                throw `Signature <${nm}> has no template`;
        }
        finally {
            this.RestoreCont(save);
            this.head = head;
        }
        this.AddConstructs(signats);
        this.wspc = wspc;
        return async function COMPONENT(area) {
            let constr = templates.map(C => ({ ...C }));
            if (bRecurs)
                constr.forEach(DefConstr);
            let saved = SaveEnv();
            try {
                bldr && await this.CallWithHandling(bldr, srcElm, area);
                let CEnv = CloneEnv(env);
                for (let c of constr)
                    c.CEnv = CEnv;
            }
            finally {
                RestEnv(saved);
            }
            if (!bRecurs)
                constr.forEach(DefConstr);
        };
    }
    async CompTempl(signat, contentNode, srcElm, bIsSlot, encStyles, atts) {
        let saved = this.SaveCont();
        try {
            let myAtts = atts || new Atts(srcElm), lvars = signat.Params.map(({ mode, nm }) => [nm, this.newV((myAtts.get(mode + nm) ?? myAtts.get(nm, bIsSlot)) || nm)]);
            this.AddConstructs(signat.Slots.values());
            if (!atts)
                myAtts.ChkNoAttsLeft();
            this.wspc = this.rspc = 1;
            let builder = await this.CompChildNodes(contentNode), { nm: Cnm } = signat, customName = /^[A-Z].*-/.test(Cnm) ? Cnm : `rhtml-${Cnm}`;
            return async function TEMPLATE(area, args, mSlotTemplates, slotEnv) {
                let saved = SaveEnv(), i = 0;
                try {
                    for (let [nm, templates] of mSlotTemplates)
                        DefConstr({ nm, templates, CEnv: slotEnv, Cnm });
                    for (let [nm, lv] of lvars) {
                        let arg = args[nm], dflt;
                        if (arg === U && (dflt = signat.Params[i]?.pDflt))
                            arg = dflt();
                        lv(arg);
                        i++;
                    }
                    if (encStyles) {
                        let { rng: elmRange, childArea, bInit } = PrepElm(srcElm, area, customName), elm = elmRange.node, shadow = elm.shadowRoot || elm.attachShadow({ mode: 'open' });
                        if (bInit)
                            for (let style of encStyles)
                                shadow.appendChild(style.cloneNode(T));
                        if (signat.RestParam)
                            ApplyMod(elm, { mt: 8, nm: N, depV: null }, args[signat.RestParam.nm], bInit);
                        childArea.parent = shadow;
                        area = childArea;
                    }
                    await builder.call(this, area);
                }
                finally {
                    RestEnv(saved);
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
        let { nm, RestParam } = signat, contSlot = signat.Slots.get('contents') || signat.Slots.get('content'), getArgs = [], SBldrs = new Map();
        for (let [nm] of signat.Slots)
            SBldrs.set(nm, []);
        for (let { mode, nm, pDflt } of signat.Params)
            if (mode == '@') {
                let attVal = atts.get(mode + nm, !pDflt);
                getArgs.push(attVal
                    ? [nm, this.CompJScript(attVal, mode + nm),
                        this.CompJScript(`ORx=>{${attVal}=ORx}`, nm)
                    ]
                    : [nm, U, () => dU]);
            }
            else if (mode != '...') {
                let dH = this.CompParam(atts, nm, !pDflt);
                if (dH)
                    getArgs.push([nm, dH]);
            }
        let slotElm, slot;
        for (let node of Array.from(srcElm.children))
            if ((slot = signat.Slots.get((slotElm = node).localName))
                && slot != contSlot) {
                SBldrs.get(slotElm.localName).push(await this.CompTempl(slot, slotElm, slotElm, T));
                srcElm.removeChild(node);
            }
        if (contSlot)
            SBldrs.get(contSlot.nm).push(await this.CompTempl(contSlot, srcElm, srcElm, T, N, atts));
        if (RestParam) {
            let modifs = this.CompAttribs(atts);
            getArgs.push([
                RestParam.nm,
                () => modifs.map(M => ({ M, value: M.depV() }))
            ]);
        }
        atts.ChkNoAttsLeft();
        this.wspc = 3;
        return async function INSTANCE(area) {
            let IEnv = env, { rng, sub, bInit } = PrepArea(srcElm, area), cdef = env.cdefs.get(nm), args = rng.result || (rng.result = {});
            if (!cdef)
                return;
            bRO = T;
            for (let [nm, dGet, dSet] of getArgs)
                if (!dSet)
                    args[nm] = dGet();
                else if (bInit)
                    args[nm] = RVAR('', dGet && dGet(), N, dSet());
                else if (dGet)
                    args[nm].V = dGet();
            bRO = F;
            env = cdef.CEnv;
            try {
                for (let template of cdef.templates)
                    await template.call(this, sub, args, SBldrs, signat.bIsSlot && signat.Slots.size ? CloneEnv(IEnv) : IEnv);
            }
            finally {
                env = IEnv;
            }
        };
    }
    async CompHTMLElement(srcElm, atts) {
        let nm = srcElm.localName.replace(/\.+$/, ''), preWs = this.wspc, postWs;
        if (this.mPreformatted.has(nm)) {
            this.wspc = 4;
            postWs = 1;
        }
        else if (regBlock.test(nm))
            postWs = this.wspc = this.rspc = 1;
        else if (regInline.test(nm)) {
            this.wspc = this.rspc = 1;
            postWs = 3;
        }
        if (preWs == 4)
            postWs = preWs;
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
            if (mt == 1 && nm == 'valueasnumber')
                nm = 'value';
            modifs.push({ mt, nm, depV });
        }
        for (let [nm, V] of atts) {
            try {
                if (m = /(.*?)\.+$/.exec(nm))
                    addM(0, nm, this.CompString(V, nm));
                else if (m = /^on(.*?)\.*$/i.exec(nm))
                    addM(5, m[0], this.AddErrH(this.CompHandler(nm, V)));
                else if (m = /^#class[:.](.*)$/.exec(nm))
                    addM(3, m[1], this.CompJScript(V, nm));
                else if (m = /^(#)?style\.(.*)$/.exec(nm))
                    addM(4, CapitalProp(m[2]), m[1] ? this.CompJScript(V, nm) : this.CompString(V, nm));
                else if (nm == '+style')
                    addM(6, nm, this.CompJScript(V, nm));
                else if (nm == "+class")
                    addM(7, nm, this.CompJScript(V, nm));
                else if (m = /^([\*\+#!]+|@@?)(.*?)\.*$/.exec(nm)) {
                    let nm = altProps[m[2]] || m[2], setter;
                    if (m[1] != '#')
                        try {
                            let dS = this.CompJScript(`$=>{if(${V}!==$)${V}=$}`), cnm;
                            setter = () => {
                                let S = dS();
                                return function () {
                                    S(this[cnm || (cnm = CheckNm(this, nm))]);
                                };
                            };
                        }
                        catch (err) {
                            throw `Invalid left-hand side '${V}'`;
                        }
                    if (/[@#]/.test(m[1])) {
                        let depV = this.CompJScript(V, nm);
                        if (/^on/.test(nm))
                            addM(5, nm, this.AddErrH(depV));
                        else
                            addM(1, nm, depV);
                    }
                    if (/\*/.test(m[1]))
                        addM(9, nm, setter);
                    if (/\+/.test(m[1]))
                        addM(10, nm, setter);
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
            + /\{((\{(\{.*?\}|.)*?\}|'(\\'|.)*?'|"(\\"|.)*?"|`(\\`|.)*?`|\\\}|.)*?)\}|$/.source, 'gs')), gens = [], ws = nm || this.Settings.bKeepWhiteSpace ? 4 : this.wspc, isTriv = T, bThis, lastIndex = regIS.lastIndex = 0, dep, m;
        while (T)
            if (!(m = regIS.exec(data))[1]) {
                let fixed = lastIndex < m.index ? data.slice(lastIndex, m.index) : N;
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
                    isTriv = F;
                    bThis || (bThis = getS.bThis);
                }
                lastIndex = regIS.lastIndex;
            }
        if (isTriv) {
            let s = gens.join('');
            (dep = () => s).fixed = s;
        }
        else
            dep =
                function () {
                    try {
                        let s = "";
                        for (let gen of gens)
                            s +=
                                typeof gen == 'string' ? gen
                                    : (bThis ? gen.call(this) : gen()) ?? '';
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
            let lastIndex = regIS.lastIndex, m = regIS.exec(patt), literals = patt.slice(lastIndex, m.index);
            if (literals)
                reg += quoteReg(literals);
            reg +=
                m[1]
                    ? (lvars.push(this.newV(m[1])), `(.*?)`)
                    : m[0] == '?' ? '.'
                        : m[0] == '*' ? '.*'
                            : m[2] ? m[2]
                                : m[0];
        }
        return { lvars, regex: new RegExp(`^${reg}$`, 'i'), url };
    }
    CompParam(atts, attName, bReq) {
        let v = atts.get(attName);
        return (v == N ? this.CompAttrExpr(atts, attName, bReq)
            : /^on/.test(attName) ? this.CompHandler(attName, v)
                : this.CompString(v, attName));
    }
    CompAttrExpr(atts, attName, bReq) {
        return this.CompJScript(atts.get(attName, bReq, T), attName);
    }
    CompHandler(nm, text) {
        return /^#/.test(nm) ? this.CompJScript(text, nm)
            : this.CompJScript(`function(event){${text}\n}`, nm);
    }
    CompJScript(expr, descrip, delims = '""') {
        if (expr == N)
            return N;
        let bThis = /\bthis\b/.test(expr), depExpr = bThis ?
            `'use strict';(function expr([${this.ctxStr}]){return (${expr}\n)})`
            : `'use strict';([${this.ctxStr}])=>(${expr}\n)`, errorInfo = `${descrip ? `[${descrip}] ` : ''}${delims[0]}${Abbrev(expr, 60)}${delims[1]}: `;
        try {
            let rout = gEval(depExpr);
            return addP(bThis
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
                }, "bThis", bThis);
        }
        catch (err) {
            throw errorInfo + err;
        }
    }
    CompName(nm) {
        let i = this.ctxMap.get(nm);
        if (!i)
            throw `Unknown name '${nm}'`;
        return () => env[i];
    }
    compAttrExprList(atts, attName, bReacts) {
        let list = atts.get(attName, F, T);
        if (list == N)
            return N;
        if (bReacts)
            for (let nm of split(list))
                this.cRvars.set(nm, F);
        return this.CompJScript(`[${list}\n]`, attName);
    }
    AddErrH(getHndlr) {
        return () => {
            let hndlr = getHndlr(), oE = onerr, oS = onsucc;
            return (hndlr && (oE || oS)
                ? function hError(ev) {
                    try {
                        let r = hndlr.call(this, ev);
                        if (r instanceof Promise)
                            return r.then(oS && (v => (oS(ev), v)), oE);
                        if (oS)
                            oS(ev);
                        return r;
                    }
                    catch (err) {
                        if (!oE)
                            throw err;
                        oE(err);
                    }
                }
                : hndlr);
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
    async fetchModule(src) {
        let m = document.getElementById(src);
        if (!m) {
            let d = parser.parseFromString(await this.FetchText(src), 'text/html'), b = d.body, e = b.firstElementChild;
            if (e?.tagName != 'MODULE')
                return concIter(d.head.childNodes, b.childNodes);
            m = e;
        }
        else if (m.tagName != 'MODULE')
            throw `#${src} must be a <MODULE>`;
        return m.childNodes;
    }
}
RCompiler.iNum = 0;
export async function RFetch(input, init) {
    let r = await gFetch(input, init);
    if (!r.ok)
        throw `${init?.method || 'GET'} ${input} returned ${r.status} ${r.statusText}`;
    return r;
}
function quoteReg(fixed) {
    return fixed.replace(/[.()?*+^$\\]/g, s => `\\${s}`);
}
class Atts extends Map {
    constructor(elm) {
        super();
        for (let att of elm.attributes)
            if (!/^_/.test(att.name))
                super.set(att.name, att.value);
    }
    get(nm, bRequired, bHashAllowed) {
        let m = nm, v = super.get(m);
        if (v == N && bHashAllowed)
            v = super.get(m = '#' + nm);
        if (v != N)
            super.delete(m);
        else if (bRequired)
            throw `Missing attribute [${nm}]`;
        return v;
    }
    getB(nm) {
        let v = this.get(nm), m = /^((false)|true)?$/i.exec(v);
        if (v != N) {
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
let altProps = { "class": "className", for: "htmlFor" }, genAtts = /^#?(?:((?:this)?reacts?on)|(?:(before)|on|after)((?:create|update|destroy)+)|on((error)-?|success))$/, regIdent = /^[A-Za-z_$][A-Za-z0-9_$]*$/, regReserv = /^(?:break|case|catch|class|continue|debugger|default|delete|do|else|export|extends|finally|for|function|if|import|in|instanceof|new|return|super|switch|this|throw|try|typeof|var|void|while|with|enum|implements|interface|let|package|private|protected|public|static|yield|null|true|false)$/, words = 'accent|additive|align|angle|animation|ascent|aspect|auto|back(drop|face|ground)|backface|behavior|blend|block|border|bottom|box|break|caption|caret|character|clip|color|column(s$)?|combine|conic|content|counter|css|decoration|display|emphasis|empty|end|feature|fill|filter|flex|font|forced|frequency|gap|grid|hanging|hue|hyphenate|image|initial|inline|inset|iteration|justify|language|left|letter|line(ar)?|list|margin|mask|masonry|math|max|min|nav|object|optical|outline|overflow|padding|page|paint|perspective|place|play|pointer|rotate|position|print|radial|read|repeating|right|row(s$)?|ruby|rule|scale|scroll(bar)?|shape|size|snap|skew|skip|speak|start|style|tab(le)?|template|text|timing|top|touch|transform|transition|translate|underline|unicode|user|variant|variation|vertical|viewport|white|will|word|writing|^z', regCapit = new RegExp(`(${words})|.`, "g"), regBlock = /^(body|blockquote|d[dlt]|div|form|h\d|hr|li|ol|p|table|t[rhd]|ul|select|title)$/, regInline = /^(button|input|img)$/;
function CheckId(nm) {
    if (!regIdent.test(nm))
        throw `Invalid identifier '${nm}'`;
    if (regReserv.test(nm))
        throw `Reserved keyword '${nm}'`;
    return nm;
}
function CapitalProp(nm) {
    let b;
    return nm.replace(regCapit, (w, w1) => {
        let r = b ? w.slice(0, 1).toUpperCase() + w.slice(1) : w;
        b = w1;
        return r;
    });
}
let Cnames = {};
function CheckNm(obj, nm) {
    if (Cnames[nm])
        return Cnames[nm];
    let r = new RegExp(`^${nm}$`, 'i');
    if (!(nm in obj))
        for (let pr in obj)
            if (r.test(pr)) {
                nm = pr;
                break;
            }
    return Cnames[nm] = nm;
}
function OuterOpenTag(elm, maxLen) {
    return Abbrev(/<.*?(?=>)/s.exec(elm.outerHTML)[0], maxLen - 1) + '>';
}
function Abbrev(s, maxLen) {
    return (maxLen && s.length > maxLen
        ? s.slice(0, maxLen - 3) + "..."
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
function* concIter(R, S) {
    for (let x of R)
        yield x;
    for (let x of S)
        yield x;
}
function* mapIter(I, f) {
    for (let x of I)
        yield f(x);
}
function* split(s) {
    if (s)
        for (let v of s.split(',')) {
            v = v.trim();
            if (v)
                yield v;
        }
}
function addP(t, p, v) {
    t[p] = v;
    return t;
}
function createErrNode(msg) {
    let e = document.createElement('div');
    e.style.color = 'crimson';
    e.style.fontFamily = 'sans-serif';
    e.style.fontSize = '10pt';
    e.innerText = msg;
    return e;
}
function copyStyleSheets(S, D) {
    for (let SSheet of S.styleSheets) {
        let DSheet = D.head.appendChild(D.createElement('style')).sheet;
        for (let rule of SSheet.cssRules)
            DSheet.insertRule(rule.cssText);
    }
}
let _rng = function* range(from, count, step = 1) {
    if (count === U) {
        count = from;
        from = 0;
    }
    for (let i = 0; i < count; i++)
        yield from + i * step;
};
Object.defineProperties(globalThis, {
    RVAR: { get: () => R.RVAR.bind(R) },
    RUpdate: { get: () => R.RUpdate.bind(R) },
});
export let R = new RCompiler(), RVAR = globalThis.RVAR, RUpdate = globalThis.RUpdate, docLocation = RVAR('docLocation', location.href), reroute = (arg) => {
    if (typeof arg == 'object') {
        if (arg.ctrlKey)
            return;
        arg.preventDefault();
        arg = arg.target.href;
    }
    docLocation.V = new URL(arg, location.href).href;
};
export { _rng as range };
Object.assign(globalThis, { range: _rng, reroute, RFetch });
Object.assign(docLocation, {
    search(key, val) {
        let url = new URL(location.href);
        if (val == N)
            url.searchParams.delete(key);
        else
            url.searchParams.set(key, val);
        return url.href;
    },
    getSearch(key) {
        return this.searchParams.get(key);
    },
    setSearch(key, val) {
        this.V = this.search(key, val);
    },
    RVAR(key, ini, varNm = key) {
        let R = RVAR(varNm, N, N, v => docLocation.setSearch(key, v));
        docLocation.Subscribe(() => { R.V = this.getSearch(key) ?? ini; }, T);
        return R;
    }
});
Object.defineProperty(docLocation, 'subpath', { get: () => location.pathname.slice(docLocation.basepath.length) });
docLocation.Subscribe(loc => {
    if (loc != location.href)
        history.pushState(N, N, loc);
    docLocation.searchParams = new URLSearchParams(location.search);
    ScrollToHash();
}, T);
W.addEventListener('popstate', () => { docLocation.V = location.href; });
function ScrollToHash() {
    if (location.hash)
        setTimeout((() => document.getElementById(location.hash.slice(1))?.scrollIntoView()), 6);
}
setTimeout(() => /^rhtml$/i.test(document.body.getAttribute('type'))
    && RCompile(document.body), 0);
