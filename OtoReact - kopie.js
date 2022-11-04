const U = undefined, N = null, T = true, F = false, E = [], W = window, D = document, L = location, G = W.globalThis || (W.globalThis = W.self), defaults = {
    bTiming: F,
    bAbortOnError: F,
    bShowErrors: T,
    bRunScripts: F,
    basePattern: '/',
    preformatted: E,
    bNoGlobals: F,
    bDollarRequired: F,
    bSetPointer: T,
    bKeepWhiteSpace: F,
    bKeepComments: F,
    storePrefix: "RVAR_"
}, parser = new DOMParser(), gEval = eval, ass = Object.assign;
class Range {
    constructor(ar, node, text) {
        this.text = text;
        this.node = node;
        if (ar) {
            let r = ar.parR;
            if (r && !r.node)
                this.parR = r;
            if (r = ar.prevR)
                r.next = this;
            else if (r = ar.parR)
                r.child = this;
            ar.prevR = this;
        }
    }
    toString() { return this.text || this.node?.nodeName; }
    get First() {
        let f;
        if (f = this.node)
            return f;
        let c = this.child;
        while (c) {
            if (f = c.First)
                return f;
            c = c.next;
        }
    }
    get Next() {
        let r = this, n, p;
        do {
            p = r.parR;
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
    erase(par) {
        let { node, child: ch } = this;
        if (node && par) {
            par.removeChild(node);
            par = N;
        }
        this.child = N;
        while (ch) {
            if (ch.bfDest)
                ch.bfDest.call(ch.node || par);
            ch.erase(ch.parN || par);
            if (ch.rvars)
                for (let r of ch.rvars)
                    r._Subs.delete(ch.subs);
            if (ch.onDest)
                ch.onDest.call(ch.node || par);
            ch = ch.next;
        }
    }
}
let dU = () => U, dumB = async (_) => { };
function PrepArea(srcE, ar, text = '', nWipe, res) {
    let { parN, rng } = ar, sub = { parN, rng: N }, bCr = !rng;
    if (bCr) {
        sub.srcN = ar.srcN;
        sub.bfor = ar.bfor;
        if (srcE)
            text = srcE.localName + (text && ' ') + text;
        (rng = sub.parR = new Range(ar, N, text)).res = res;
    }
    else {
        sub.rng = rng.child;
        ar.rng = rng.next;
        if (nWipe && (nWipe > 1 || res != rng.res)) {
            rng.res = res;
            rng.erase(parN);
            sub.rng = N;
            sub.bfor = rng.Next;
            sub.parR = rng;
            bCr = T;
        }
    }
    return { rng, sub, bCr };
}
function PrepElm(srcE, ar, nodeName = srcE.nodeName) {
    let rng = ar.rng, bCr = !rng;
    if (bCr)
        rng = new Range(ar, ar.srcN == srcE
            ? (srcE.innerHTML = "", srcE)
            : ar.parN.insertBefore(D.createElement(nodeName), ar.bfor));
    else
        ar.rng = rng.next;
    return {
        rng,
        chArea: {
            parN: rng.node,
            rng: rng.child,
            bfor: N,
            parR: rng
        },
        bCr
    };
}
function PrepCharData(ar, content, bComm) {
    let rng = ar.rng;
    if (!rng)
        new Range(ar, ar.parN.insertBefore(bComm ? D.createComment(content) : D.createTextNode(content), ar.bfor));
    else {
        rng.node.data = content;
        ar.rng = rng.next;
    }
}
let childWins = new Set();
export async function RCompile(elm = D.body, settings) {
    try {
        let { basePattern } = R.Settings = { ...defaults, ...settings }, m = L.href.match(`^.*(${basePattern})`);
        R.FilePath = L.origin + (DL.basepath = m ? (new URL(m[0])).pathname.replace(/[^/]*$/, '') : '');
        await R.Compile(elm);
        start = performance.now();
        builtNodeCnt = 0;
        let ar = { parN: elm.parentElement, srcN: elm, rng: N };
        await R.Build(ar);
        W.addEventListener('pagehide', () => childWins.forEach(w => w.close()));
        R.log(`${R.num}: Built ${builtNodeCnt} nodes in ${(performance.now() - start).toFixed(1)} ms`);
        ScrollToHash();
    }
    catch (e) {
        alert(`OtoReact error: ` + LAbbr(e));
    }
}
function NewEnv() {
    return addP([], 'C', []);
}
function CloneEnv(env) {
    return addP(ass([], env), 'C', ass([], env.C));
}
function assignEnv(target, source) {
    let C = ass(target.C, source.C);
    ass(target, source);
    target.C = C;
}
function GetC(env, k) {
    return env.C[k];
}
class Signature {
    constructor(srcElm, bIsSlot) {
        this.srcElm = srcElm;
        this.bIsSlot = bIsSlot;
        this.Params = [];
        this.RestP = N;
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
    constructor(name, initial, store, storeName) {
        this.name = name;
        this.store = store;
        this.storeName = storeName;
        this.v = U;
        this._Subs = new Set();
        if (name)
            G[name] = this;
        let s = store && store.getItem(this._sNm), t = initial;
        if (s)
            try {
                this.v = JSON.parse(s);
                return;
            }
            catch { }
        t instanceof Promise ?
            t.then(v => this.V = v, onerr)
            : (this.v = t);
    }
    get _sNm() {
        return this.storeName || R.Settings.storePrefix + this.name;
    }
    Subscribe(s, bImmediate, bCr = bImmediate) {
        if (s) {
            if (bCr)
                s(this.v);
            s.bImm = bImmediate;
            this._Subs.add(s);
        }
        return this;
    }
    Unsubscribe(s) {
        this._Subs.delete(s);
    }
    get V() { return this.v; }
    set V(t) {
        if (t !== this.v) {
            this.v = t;
            this.SetDirty();
        }
    }
    get Set() {
        return (t) => t instanceof Promise ?
            ((this.V = U), t.then(v => this.V = v, onerr))
            : (this.V = t);
    }
    get Clear() {
        return _ => DirtyVars.has(this) || (this.V = U);
    }
    get U() {
        if (!ro)
            this.SetDirty();
        return this.v;
    }
    set U(t) { this.v = t; this.SetDirty(); }
    SetDirty() {
        let b;
        for (let sub of this._Subs)
            if (sub.bImm)
                sub(this.v);
            else
                b = T;
        if (b || this.store) {
            DirtyVars.add(this);
            RUpdate();
        }
    }
    Save() {
        this.store.setItem(this._sNm, JSON.stringify(this.v ?? null));
    }
    toString() {
        return this.v.toString();
    }
}
function Subscriber({ parN, bRootOnly }, builder, rng, ...args) {
    if (rng)
        rng.updated = updCnt;
    let sArea = {
        parN, bRootOnly,
        rng,
    }, subEnv = { env: CloneEnv(env), onerr, onsuc }, subs = async (_) => {
        let { rng } = sArea, save = { env, onerr, onsuc };
        if (!rng || rng.updated < updCnt) {
            ({ env, onerr, onsuc } = subEnv);
            if (rng)
                rng.updated = updCnt;
            builtNodeCnt++;
            try {
                await builder({ ...sArea }, ...args);
            }
            finally {
                ({ env, onerr, onsuc } = save);
            }
        }
    };
    subs.sArea = sArea;
    subs.env = subEnv.env;
    return subs;
}
let DirtyVars = new Set(), bUpdating, hUpdate = N, start;
function RUpdate() {
    if (!bUpdating && !hUpdate)
        hUpdate = setTimeout(_ => {
            hUpdate = N;
            DoUpdate();
        }, 5);
}
export async function DoUpdate() {
    if (!R.bCompiled || bUpdating)
        return;
    bUpdating = T;
    try {
        builtNodeCnt = 0;
        start = performance.now();
        while (DirtyVars.size) {
            updCnt++;
            let dv = DirtyVars;
            DirtyVars = new Set();
            for (let rv of dv) {
                if (rv.store)
                    rv.Save();
                for (let subs of rv._Subs)
                    if (!subs.bImm)
                        try {
                            await subs(rv instanceof _RVAR ? rv.V : rv);
                        }
                        catch (e) {
                            console.log(e = `ERROR: ` + LAbbr(e));
                            alert(e);
                        }
            }
        }
        R.log(`Updated ${builtNodeCnt} nodes in ${(performance.now() - start).toFixed(1)} ms`);
    }
    finally {
        bUpdating = F;
    }
}
export function RVAR(nm, value, store, subs, storeName) {
    let r = new _RVAR(nm, value, store, storeName);
    r.Subscribe(subs, T, F);
    return r;
}
function RVAR_Light(t, updTo) {
    if (!t._Subs) {
        t._Subs = new Set();
        t._UpdTo = updTo;
        Object.defineProperty(t, 'U', { get: () => {
                if (!ro) {
                    DirtyVars.add(t);
                    if (t._UpdTo?.length)
                        for (let rvar of t._UpdTo)
                            rvar.SetDirty();
                    else
                        RUpdate();
                }
                return t;
            }
        });
        t.Subscribe = sub => t._Subs.add(sub);
    }
    return t;
}
let ro = F;
function ApplyMod(elm, M, val, bCr) {
    let { mt, nm } = M;
    if (!M.c) {
        if (mt == 1 && nm == 'valueasnumber' && elm.type == 'number')
            nm = 'value';
        M.c = mt != 1 && mt != 5 || (nm = M.nm = ChkNm(elm, nm));
    }
    switch (mt) {
        case 0:
            elm.setAttribute(nm, val);
            break;
        case 2:
            elm.setAttribute('src', new URL(val, nm).href);
            break;
        case 1:
            if (val == N && typeof elm[nm] == 'string')
                val = '';
            if (val !== elm[nm])
                elm[nm] = val;
            break;
        case 5:
            let m;
            if (val)
                if (m = /^on(input|change)$/.exec(nm)) {
                    elm.addEventListener(m[1], val);
                    (elm.hndlrs || (elm.hndlrs = [])).push({ evType: m[1], listener: val });
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
            for (let { M, value } of val || E)
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
    ro = T;
    for (let M of modifs)
        try {
            ApplyMod(elm, M, M.depV.call(elm), bCreate);
        }
        catch (err) {
            throw `[${M.nm}]: ${err}`;
        }
    ro = F;
}
let RModules = new Map(), env, onerr, onsuc, builtNodeCnt = 0, envActions = [], updCnt = 0;
function SaveEnv() {
    return envActions.length;
}
function RestEnv(savedEnv) {
    for (let j = envActions.length; j > savedEnv; j--)
        envActions.pop()();
}
class RCompiler {
    constructor(RC, FilePath, bClr) {
        this.num = RCompiler.iNum++;
        this.cRvars = new Map();
        this.restoreActions = [];
        this.setPRE = new Set(['pre']);
        this.wspc = 1;
        this.rspc = T;
        this.srcNodeCnt = 0;
        this.Settings = RC ? { ...RC.Settings } : { ...defaults };
        RC || (RC = this);
        this.FilePath = FilePath || RC.FilePath;
        this.doc = RC.doc || D;
        this.head = RC.head || this.doc.head;
        if (bClr)
            RC = this;
        this.ctStr = RC.ctStr || "";
        this.ctMap = new Map(RC.ctMap);
        this.ctLen = RC.ctLen || 0;
        this.ctSigns = new Map(RC.ctSigns);
        this.ctCCnt = RC.ctCCnt || 0;
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
            let { ctStr, ctLen, ctMap } = this, i = ctMap.get(ChkId(nm));
            this.restoreActions.push(() => {
                this.ctStr = ctStr;
                this.ctLen = ctLen;
                mapSet(ctMap, nm, i);
            });
            this.ctStr = ctStr.replace(new RegExp(`\\b${nm}\\b`), '') + nm + ',';
            ctMap.set(nm, this.ctLen++);
            lv =
                ((v, bUpd) => {
                    if (!bUpd)
                        envActions.push(() => env.length = ctLen);
                    env[ctLen] = v;
                });
        }
        lv.nm = nm;
        return lv;
    }
    NewVars(varlist) {
        return Array.from(split(varlist), nm => this.newV(nm));
    }
    NewConstructs(listS) {
        let { ctCCnt, ctSigns } = this, prevCs = [];
        for (let S of listS) {
            prevCs.push([S.nm, ctSigns.get(S.nm)]);
            ctSigns.set(S.nm, [S, this.ctCCnt++]);
        }
        if (prevCs.length == 0)
            return dU;
        this.restoreActions.push(() => {
            this.ctCCnt = ctCCnt;
            for (let [nm, CS] of prevCs)
                mapSet(ctSigns, nm, CS);
        });
        return (CDefs) => {
            envActions.push(() => env.C.length = ctCCnt);
            let i = ctCCnt;
            for (let C of CDefs)
                env.C[i++] = C;
        };
    }
    async Compile(elm, settings = {}, childnodes) {
        let t0 = performance.now();
        ass(this.Settings, settings);
        for (let tag of this.Settings.preformatted)
            this.setPRE.add(tag.toLowerCase());
        this.Builder = childnodes
            ? await this.CompChildNodes(elm, childnodes)
            : (await this.CompElm(elm.parentElement, elm, T))[0];
        this.bCompiled = T;
        this.log(`${this.num} Compiled ${this.srcNodeCnt} nodes in ${(performance.now() - t0).toFixed(1)} ms`);
    }
    log(msg) {
        if (this.Settings.bTiming)
            console.log(new Date().toISOString().substring(11) + ' ' + msg);
    }
    async Build(ar) {
        let saveR = R;
        R = this;
        env = NewEnv();
        builtNodeCnt++;
        await this.Builder(ar);
        R = saveR;
    }
    async CompChildNodes(srcParent, childNodes = srcParent.childNodes) {
        let saved = this.SaveCont();
        try {
            let bldr = await this.CompIter(srcParent, childNodes);
            return bldr ?
                async function ChildNodes(ar) {
                    let savEnv = SaveEnv();
                    try {
                        await bldr(ar);
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
        let bldrs = [], { rspc } = this, arr = Array.from(iter), i = 0;
        while (rspc && arr.length && reWS.test(arr[arr.length - 1].nodeValue))
            arr.pop();
        for (let srcNode of arr) {
            this.rspc = ++i == arr.length && rspc;
            let trip;
            switch (srcNode.nodeType) {
                case Node.ELEMENT_NODE:
                    this.srcNodeCnt++;
                    trip = await this.CompElm(srcParent, srcNode);
                    break;
                case Node.TEXT_NODE:
                    this.srcNodeCnt++;
                    let str = srcNode.nodeValue;
                    let getText = this.CompString(str), { fixed } = getText;
                    if (fixed !== '') {
                        trip =
                            [fixed
                                    ? async (ar) => PrepCharData(ar, fixed)
                                    : async (ar) => PrepCharData(ar, getText()), srcNode,
                                fixed == ' '];
                        if (this.wspc < 4)
                            this.wspc = / $/.test(str) ? 2 : 3;
                    }
                    break;
                case Node.COMMENT_NODE:
                    if (this.Settings.bKeepComments) {
                        let getText = this.CompString(srcNode.nodeValue, 'Comment');
                        trip =
                            [async (ar) => PrepCharData(ar, getText(), T), srcNode, 1];
                    }
                    break;
            }
            if (trip ? trip[0].ws : this.rspc)
                prune();
            if (trip)
                bldrs.push(trip);
        }
        function prune() {
            let i = bldrs.length, isB;
            while (i-- && (isB = bldrs[i][2]))
                if (isB === T)
                    bldrs.splice(i, 1);
        }
        if (rspc)
            prune();
        if (!bldrs.length)
            return N;
        return addP(async function Iter(ar, start = 0) {
            let i = 0, toSubscribe = [];
            if (!ar.rng) {
                for (let [bldr] of bldrs) {
                    i++;
                    await bldr(ar);
                    if (bldr.auto)
                        toSubscribe.push([Subscriber(ar, Iter, ar.prevR, i), ar.prevR.val._Subs.size]);
                }
                for (let [subs, s] of toSubscribe) {
                    let { sArea } = subs, r = sArea.rng, rvar = r.val;
                    if (rvar._Subs.size == s && r.next) {
                        (sArea.rng = r.next).updated = updCnt;
                        rvar.Subscribe(rvar.auto = subs);
                    }
                }
            }
            else
                for (let [bldr] of bldrs)
                    if (i++ >= start) {
                        let r = ar.rng;
                        await bldr(ar);
                        if (bldr.auto && r.val?.auto)
                            assignEnv(r.val.auto.env, env);
                    }
            builtNodeCnt += bldrs.length - start;
        }, "ws", bldrs[0][0].ws);
    }
    async CompElm(srcPrnt, srcElm, bUnhide) {
        try {
            let tag = srcElm.localName, atts = new Atts(srcElm), cl = this.ctLen, reacts = [], bfor = [], after = [], raLength = this.restoreActions.length, dOnerr, dOnsuc, bldr, elmBldr, isBl, m, nm, constr = this.ctSigns.get(tag), dIf = this.CompAttrExpr(atts, 'if'), dHash = tag != 'for' && this.compAttrExprList(atts, 'hash');
            for (let att of atts.keys())
                if (m = genAtts.exec(att))
                    if (m[1])
                        att == 'on' && tag != 'react' || reacts.push({ att, dRV: this.compAttrExprList(atts, att, T) });
                    else {
                        let txt = atts.g(att);
                        if (nm = m[3])
                            (m[2] ? bfor : after).push({ att, txt, C: /c/i.test(nm), U: /u/i.test(nm), D: /y/i.test(nm) });
                        else {
                            let hndlr = this.CompHandlr(att, txt);
                            if (m[5])
                                (dOnerr = hndlr).bBldr = !/-$/.test(att);
                            else
                                dOnsuc = hndlr;
                        }
                    }
            if (bUnhide)
                atts.set('#hidden', 'false');
            if (constr)
                bldr = await this.CompInstance(srcElm, atts, constr);
            else {
                switch (tag) {
                    case 'def':
                    case 'define':
                        {
                            NoChildren(srcElm);
                            let rv = atts.g('rvar'), t = '@value', t_val = rv && atts.g(t), dSet = t_val && this.CompTarget(t_val, t), dGet = t_val ? this.CompJScript(t_val, t) : this.CompParam(atts, 'value'), dUpd = rv && this.CompAttrExpr(atts, 'updates'), dSto = rv && this.CompAttrExpr(atts, 'store'), dSNm = dSto && this.CompParam(atts, 'storename'), bReact = atts.gB('reacting') || atts.gB('updating') || t_val, vLet = this.newV(rv || atts.g('let') || atts.g('var', T)), onMod = rv && this.CompParam(atts, 'onmodified');
                            bldr = async function DEF(ar, bReOn) {
                                let { rng, bCr } = PrepArea(srcElm, ar);
                                if (bCr || bReact || bReOn) {
                                    ro = T;
                                    let v = dGet?.();
                                    ro = F;
                                    if (rv)
                                        if (bCr) {
                                            let rvUp = dUpd?.();
                                            (rng.val =
                                                RVAR(rv, v, dSto?.(), dSet?.(), dSNm?.()))
                                                .Subscribe(rvUp?.SetDirty?.bind(rvUp));
                                        }
                                        else
                                            rng.val.Set(v);
                                    else
                                        rng.val = v;
                                }
                                vLet(rng.val);
                                if (onMod && bCr)
                                    rng.val.Subscribe(onMod());
                            };
                            if (rv && !onMod) {
                                let a = this.cRvars.get(rv);
                                this.cRvars.set(rv, T);
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
                            let bHiding = atts.gB('hiding'), dVal = this.CompAttrExpr(atts, 'value'), caseNodes = [], body = [], bThen;
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
                                            not = !atts.gB('not');
                                            patt =
                                                (p = atts.g('match')) != N
                                                    ? this.CompPatt(p)
                                                    : (p = atts.g('urlmatch')) != N
                                                        ? this.CompPatt(p, T)
                                                        : (p = atts.g('regmatch')) != N
                                                            ? { regex: new RegExp(p, 'i'),
                                                                lvars: this.NewVars(atts.g('captures'))
                                                            }
                                                            : N;
                                            if (bHiding && patt?.lvars.length)
                                                throw `Pattern capturing cannot be combined with hiding`;
                                            if (patt && !dVal)
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
                                async function CASE(ar) {
                                    let value = dVal && dVal(), choosenAlt, matchResult;
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
                                                    PrepElm(alt.node, ar);
                                            else
                                                PrepArea(srcElm, ar, '', 1, choosenAlt);
                                            throw (alt.node.nodeName == 'IF' ? '' : OuterOpenTag(alt.node)) + err;
                                        }
                                    if (bHiding) {
                                        for (let alt of caseList) {
                                            let { rng, chArea, bCr } = PrepElm(alt.node, ar);
                                            if ((!(rng.node.hidden = alt != choosenAlt)
                                                || bCr)
                                                && !ar.bRootOnly)
                                                await R.ErrHandling(alt.bldr, alt.node, chArea);
                                        }
                                    }
                                    else {
                                        let { sub, bCr } = PrepArea(srcElm, ar, '', 1, choosenAlt);
                                        if (choosenAlt && (!ar.bRootOnly || bCr)) {
                                            let saved = SaveEnv(), i = 0;
                                            try {
                                                if (choosenAlt.patt)
                                                    for (let lv of choosenAlt.patt.lvars)
                                                        lv((choosenAlt.patt.url ? decodeURIComponent : (r) => r)(matchResult[++i]));
                                                await R.ErrHandling(choosenAlt.bldr, choosenAlt.node, sub);
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
                        atts.g('id');
                        break;
                    case 'include':
                        if (srcElm.children.length || srcElm.textContent.trim()) {
                            atts.g('src');
                            bldr = await this.CompChildNodes(srcElm);
                        }
                        else {
                            let src = atts.g('src', T), C = new RCompiler(this, this.GetPath(src)), task = (async () => await C.Compile(N, { bRunScripts: T }, await this.fetchModule(src)))();
                            bldr =
                                async function INCLUDE(ar) {
                                    let t0 = performance.now();
                                    await task;
                                    start += performance.now() - t0;
                                    await C.Builder(ar);
                                };
                        }
                        break;
                    case 'import':
                        {
                            let src = atts.g('src', T), bIncl = atts.gB('include'), vars = this.NewVars(atts.g('defines')), bAsync = atts.gB('async'), listImps = new Array(), promModule = RModules.get(src);
                            for (let ch of srcElm.children) {
                                let sign = this.ParseSignat(ch);
                                listImps.push(sign);
                            }
                            let defConstructs = this.NewConstructs(listImps);
                            if (!promModule) {
                                let C = new RCompiler(this, this.GetPath(src), T);
                                C.Settings.bRunScripts = T;
                                promModule = this.fetchModule(src).then(async (nodes) => {
                                    let bldr = (await C.CompIter(N, nodes)) || dumB;
                                    for (let clientSig of listImps) {
                                        let signat = C.ctSigns.get(clientSig.nm);
                                        if (!signat)
                                            throw `<${clientSig.nm}> is missing in '${src}'`;
                                        if (bAsync && !clientSig.IsCompatible(signat[0]))
                                            throw `Import signature ${clientSig.srcElm.outerHTML} is incompatible with module signature ${signat[0].srcElm.outerHTML}`;
                                    }
                                    for (let v of vars)
                                        if ((v.i = C.ctMap.get(v.nm)) == N)
                                            throw `Module does not define '${v.nm}'`;
                                    return [bldr.bind(C), C.ctSigns];
                                });
                                RModules.set(src, promModule);
                            }
                            if (!bAsync) {
                                let prom = promModule.then(M => {
                                    for (let sig of listImps)
                                        ass(sig, M[1].get(sig.nm)[0]);
                                });
                                for (let sig of listImps)
                                    sig.prom = prom;
                            }
                            bldr = async function IMPORT(reg) {
                                let [bldr, CSigns] = await promModule, saveEnv = env, MEnv = env = NewEnv();
                                await bldr(bIncl ? reg : { parN: D.createDocumentFragment() });
                                env = saveEnv;
                                defConstructs(listImps.map(S => GetC(MEnv, CSigns.get(S.nm)[1])));
                                for (let lv of vars)
                                    lv(MEnv[lv.i]);
                            };
                            isBl = 1;
                        }
                        break;
                    case 'react':
                        {
                            let b = bldr = await this.CompChildNodes(srcElm);
                            isBl = b == dumB;
                            if (atts.gB('renew')) {
                                bldr = function renew(sub) {
                                    return b(PrepArea(srcElm, sub, 'renew', 2).sub);
                                };
                            }
                        }
                        break;
                    case 'rhtml':
                        {
                            NoChildren(srcElm);
                            let dSrctext = this.CompParam(atts, 'srctext', T), modifs = this.CompAttribs(atts), lThis = this;
                            this.wspc = 1;
                            bldr = async function RHTML(ar) {
                                let src = dSrctext(), { rng, bCr } = PrepElm(srcElm, ar, 'rhtml-rhtml'), { node } = rng;
                                ApplyMods(node, modifs, bCr);
                                if (ar.prevR || src != rng.res) {
                                    rng.res = src;
                                    let svEnv = env, C = new RCompiler(N, lThis.FilePath), sRoot = C.head = node.shadowRoot || node.attachShadow({ mode: 'open' }), tempElm = D.createElement('rhtml'), sArea = {
                                        parN: sRoot,
                                        rng: N,
                                        parR: rng.child || (rng.child = new Range(N, N, 'Shadow'))
                                    };
                                    rng.child.erase(sRoot);
                                    sRoot.innerHTML = '';
                                    try {
                                        tempElm.innerHTML = src;
                                        await C.Compile(tempElm, { bRunScripts: T, bTiming: lThis.Settings.bTiming }, tempElm.childNodes);
                                        await C.Build(sArea);
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
                        isBl = 1;
                        break;
                    case 'style':
                        this.head.appendChild(srcElm);
                        isBl = 1;
                        break;
                    case 'component':
                        bldr = await this.CompComponent(srcElm, atts);
                        isBl = 1;
                        break;
                    case 'document':
                        {
                            let docVar = this.newV(atts.g('name', T)), RC = new RCompiler(this), bEncaps = atts.gB('encapsulate'), setVars = RC.NewVars(atts.g('params')), winV = RC.newV(atts.g('window')), docBldr = ((RC.head = D.createElement('DocumentFragment')), await RC.CompChildNodes(srcElm));
                            bldr = async function DOCUMENT(ar) {
                                let { rng, bCr } = PrepArea(srcElm, ar, docVar.name);
                                if (bCr) {
                                    let doc = ar.parN.ownerDocument, docEnv = CloneEnv(env), wins = rng.wins = new Set();
                                    rng.val = {
                                        async render(w, bCr, args) {
                                            let svEnv = env, i = 0, D = w.document;
                                            env = docEnv;
                                            for (let lv of setVars)
                                                lv(args[i++]);
                                            winV(w);
                                            try {
                                                if (bCr) {
                                                    if (!bEncaps)
                                                        copySSheets(doc, D);
                                                    for (let S of RC.head.childNodes)
                                                        D.head.append(S.cloneNode(T));
                                                }
                                                let ar = { parN: D.body, rng: w.rng };
                                                await docBldr(ar);
                                            }
                                            finally {
                                                env = svEnv;
                                            }
                                        },
                                        open(target, features, ...args) {
                                            let w = W.open('', target || '', features), bCr = !childWins.has(w);
                                            if (bCr) {
                                                w.addEventListener('keydown', function (event) { if (event.key == 'Escape')
                                                    this.close(); });
                                                w.addEventListener('close', () => childWins.delete(w), wins.delete(w));
                                                childWins.add(w);
                                                wins.add(w);
                                            }
                                            else
                                                w.document.body.innerHTML = '';
                                            this.render(w, bCr, args);
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
                                docVar(rng.val);
                            };
                            isBl = 1;
                        }
                        break;
                    case 'rhead':
                        {
                            let childBuilder = await this.CompChildNodes(srcElm), { wspc } = this;
                            this.wspc = this.rspc = 1;
                            bldr = async function HEAD(ar) {
                                let { sub } = PrepArea(srcElm, ar);
                                sub.parN = ar.parN.ownerDocument.head;
                                sub.bfor = N;
                                await childBuilder(sub);
                                if (sub.prevR)
                                    sub.prevR.parN = sub.parN;
                            };
                            this.wspc = wspc;
                            isBl = 1;
                        }
                        break;
                    case 'rstyle':
                        let save = [this.Settings.bDollarRequired, this.rIS, this.wspc];
                        this.Settings.bDollarRequired = T;
                        this.rIS = N;
                        this.wspc = 4;
                        let childBldr = await this.CompChildNodes(srcElm);
                        [this.Settings.bDollarRequired, this.rIS, this.wspc] = save;
                        bldr = async function RSTYLE(ar) {
                            let { chArea } = PrepElm(srcElm, ar, 'STYLE');
                            await childBldr(chArea);
                        };
                        isBl = 1;
                        break;
                    case 'element':
                        bldr = await this.CompHTMLElement(srcElm, atts, this.CompParam(atts, 'tagname', T));
                        this.wspc = 3;
                        break;
                    case 'attribute':
                        NoChildren(srcElm);
                        let dNm = this.CompParam(atts, 'name', T), dVal = this.CompParam(atts, 'value', T);
                        bldr = async function ATTRIB(ar) {
                            let nm = dNm(), { rng } = PrepArea(srcElm, ar);
                            if (rng.val && nm != rng.val)
                                ar.parN.removeAttribute(rng.val);
                            if (rng.val = nm)
                                ar.parN.setAttribute(nm, dVal());
                        };
                        isBl = 1;
                        break;
                    default:
                        bldr = await this.CompHTMLElement(srcElm, atts);
                        break;
                }
                atts.ChkNoAttsLeft();
            }
            let { ws } = bldr || (bldr = dumB), ill = this.restoreActions.length > raLength && (dHash && 'hash' || dIf && '#if'), hasH;
            if (ill)
                throw `'${ill}' not possible for declarations`;
            if (dOnerr || dOnsuc) {
                let b = bldr;
                bldr = async function SetOnError(ar) {
                    let oo = { onerr, onsuc };
                    try {
                        if (dOnerr)
                            (onerr = dOnerr()).bBldr = dOnerr.bBldr;
                        if (dOnsuc)
                            onsuc = dOnsuc();
                        await b(ar);
                    }
                    finally {
                        ({ onerr, onsuc } = oo);
                    }
                };
            }
            for (let g of conc(bfor, after))
                hasH = g.hndlr = this.CompHandlr(g.att, g.txt);
            if (hasH) {
                let b = bldr;
                bldr = async function ON(ar, x) {
                    let r = ar.rng, bfD;
                    for (let g of bfor) {
                        if (g.D && !r)
                            bfD = g.hndlr();
                        if (r ? g.U : g.C)
                            g.hndlr().call(r && r.node || ar.parN);
                    }
                    await b(ar, x);
                    if (bfD)
                        ar.prevR.bfDest = bfD;
                    for (let g of after) {
                        if (g.D && !r)
                            ar.prevR.onDest = g.hndlr();
                        if (r ? g.U : g.C)
                            g.hndlr().call((r ? r.node : ar.prevR?.node) || ar.parN);
                    }
                };
                if (isBl)
                    isBl = 1;
            }
            if (dHash) {
                let b = bldr;
                bldr = function HASH(ar) {
                    let { sub, rng, bCr } = PrepArea(srcElm, ar, 'hash'), hashes = dHash();
                    if (bCr || hashes.some((hash, i) => hash !== rng.val[i])) {
                        rng.val = hashes;
                        return b(sub);
                    }
                };
            }
            if (dIf) {
                let b = bldr;
                bldr = function hif(ar) {
                    let c = dIf(), { sub } = PrepArea(srcElm, ar, '#if', 1, !c);
                    if (c)
                        return b(sub);
                };
            }
            for (let { att, dRV } of reacts) {
                let b = bldr, ub = /^this/.test(att)
                    ? function reacton(sub) {
                        sub.bRootOnly = T;
                        return b(sub, T);
                    }
                    : b;
                bldr = async function REACT(ar) {
                    let { rng, sub, bCr } = PrepArea(srcElm, ar, att);
                    await ub(sub);
                    let rvars = dRV(), subs, pVars, i = 0;
                    if (bCr)
                        subs = rng.subs = Subscriber(sub, ub, rng.child, T);
                    else {
                        ({ subs, rvars: pVars } = rng);
                        if (!subs)
                            return;
                        assignEnv(subs.env, env);
                    }
                    rng.rvars = rvars;
                    rng.val = sub.prevR?.val;
                    for (let rvar of rvars) {
                        if (pVars) {
                            let pvar = pVars[i++];
                            if (rvar == pvar)
                                continue;
                            pvar._Subs.delete(subs);
                        }
                        try {
                            rvar.Subscribe(subs);
                        }
                        catch {
                            throw `[${att}] This is not an RVAR`;
                        }
                    }
                };
            }
            return bldr == dumB ? N : [elmBldr = addP(this.ctLen == cl
                    ? function Elm(ar) {
                        return R.ErrHandling(bldr, srcElm, ar);
                    }
                    : function Elm(ar) {
                        return bldr(ar).catch((e) => { throw OuterOpenTag(srcElm, 40) + ' ' + e; });
                    }, 'ws', ws), srcElm, isBl];
        }
        catch (err) {
            throw OuterOpenTag(srcElm) + ' ' + err;
        }
    }
    GetREACT(srcElm, attName, getRvars, builder) {
        let updateBuilder = (/^this/.test(attName)
            ? function reacton(sub) {
                sub.bRootOnly = T;
                return builder(sub, T);
            }
            : builder);
        return async function REACT(ar) {
            let { rng, sub, bCr } = PrepArea(srcElm, ar, attName);
            await builder(sub);
            if (getRvars) {
                let rvars = getRvars(), subs, pVars, i = 0;
                if (bCr)
                    subs = rng.subs = Subscriber(sub, updateBuilder, rng.child, T);
                else {
                    ({ subs, rvars: pVars } = rng);
                    if (!subs)
                        return;
                    assignEnv(subs.env, env);
                }
                rng.rvars = rvars;
                rng.val = sub.prevR?.val;
                for (let rvar of rvars) {
                    if (pVars) {
                        let pvar = pVars[i++];
                        if (rvar == pvar)
                            continue;
                        pvar._Subs.delete(subs);
                    }
                    try {
                        rvar.Subscribe(subs);
                    }
                    catch {
                        throw `[${attName}] This is not an RVAR`;
                    }
                }
            }
        };
    }
    async ErrHandling(builder, srcNode, ar) {
        let { rng } = ar;
        if (rng && rng.errNode) {
            ar.parN.removeChild(rng.errNode);
            rng.errNode = U;
        }
        try {
            return await builder(ar);
        }
        catch (err) {
            let message = srcNode instanceof HTMLElement ? `${OuterOpenTag(srcNode, 40)} ${err}` : err;
            if (this.Settings.bAbortOnError)
                throw message;
            console.log(message);
            if (onerr?.bBldr)
                onerr(err);
            else if (this.Settings.bShowErrors) {
                let errNode = ar.parN.insertBefore(createErrNode(message), ar.rng?.FirstOrNext);
                if (rng)
                    rng.errNode = errNode;
            }
        }
    }
    async CompScript(_srcParent, srcElm, atts) {
        let { type, text, defer, async } = srcElm, src = atts.g('src'), defs = atts.g('defines'), bMod = /^module$|;\s*type\s*=\s*("?)module\1\s*$/i.test(type), bCls = /^((text|application)\/javascript)?$/i.test(type), mOto = /^otoreact(\/((local)|static))?\b/.exec(type), sLoc = mOto && mOto[2], bUpd = atts.gB('updating'), varlist = [...split(defs)], { ctStr: context } = this, lvars = sLoc && this.NewVars(defs), exp, defNames = lvars ?
            function () {
                let i = 0;
                for (let lv of lvars)
                    lv(exp[i++]);
            }
            : function () {
                let i = 0;
                for (let nm of varlist)
                    G[nm] = exp[i++];
            };
        atts.clear();
        if (this.Settings.bRunScripts && (bMod || bCls) || mOto) {
            if (mOto && mOto[3]) {
                let prom = (async () => gEval(`'use strict';([${context}])=>{${src ? await this.FetchText(src) : text}\n;return[${defs}]}`))();
                return async function LSCRIPT(ar) {
                    let { rng, bCr } = PrepArea(srcElm, ar);
                    exp = bUpd || bCr ? rng.res = (await prom)(env) : rng.res;
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
        let letNm = atts.g('let') ?? atts.g('var'), idxNm = atts.g('index'), saved = this.SaveCont();
        if (idxNm == '')
            idxNm = 'index';
        this.rspc = F;
        try {
            if (letNm != N) {
                let prevNm = atts.g('previous'), nextNm = atts.g('next');
                if (prevNm == '')
                    prevNm = 'previous';
                if (nextNm == '')
                    nextNm = 'next';
                let getRange = this.CompAttrExpr(atts, 'of', T, iter => iter && !(Symbol.iterator in iter || Symbol.asyncIterator in iter)
                    && `Value (${iter}) is not iterable`), dUpd = this.CompAttrExpr(atts, 'updates'), bReact = atts.gB('reacting') || atts.gB('reactive') || !!dUpd, vLet = this.newV(letNm), vIdx = this.newV(idxNm), vPrev = this.newV(prevNm), vNext = this.newV(nextNm), dKey = this.CompAttrExpr(atts, 'key'), dHash = this.CompAttrExpr(atts, 'hash'), bodyBldr = await this.CompChildNodes(srcElm);
                return async function FOR(ar) {
                    let { rng, sub } = PrepArea(srcElm, ar, ''), { parN } = sub, bfor = sub.bfor !== U ? sub.bfor : rng.Next, iterable = getRange() || E, pIter = async (iter) => {
                        let svEnv = SaveEnv();
                        try {
                            let keyMap = rng.val || (rng.val = new Map()), nwMap = new Map();
                            vLet();
                            vIdx();
                            let idx = 0;
                            for await (let item of iter) {
                                vLet(item, T);
                                vIdx(idx, T);
                                let hash = dHash?.(), key = dKey?.() ?? hash;
                                if (key != N && nwMap.has(key))
                                    throw `Key '${key}' is not unique`;
                                nwMap.set(key ?? {}, { item, hash, idx: idx++ });
                            }
                            let nxChR = rng.child, iterator = nwMap.entries(), nextIter = nextNm && nwMap.values(), prItem, nxItem, prRange = N, chArea;
                            sub.parR = rng;
                            vPrev();
                            vNext();
                            nextIter?.next();
                            while (T) {
                                let k, nx = iterator.next();
                                while (nxChR && !nwMap.has(k = nxChR.key)) {
                                    if (k != N)
                                        keyMap.delete(k);
                                    nxChR.erase(parN);
                                    if (nxChR.subs)
                                        nxChR.rvars[0]._Subs.delete(nxChR.subs);
                                    nxChR.prev = N;
                                    nxChR = nxChR.next;
                                }
                                if (nx.done)
                                    break;
                                let [key, { item, hash, idx }] = nx.value, chRng = keyMap.get(key), bCr = !chRng;
                                if (nextIter)
                                    nxItem = nextIter.next().value?.item;
                                if (bCr) {
                                    sub.rng = N;
                                    sub.prevR = prRange;
                                    sub.bfor = nxChR?.FirstOrNext || bfor;
                                    ({ rng: chRng, sub: chArea } = PrepArea(N, sub, `${letNm}(${idx})`));
                                    if (key != N) {
                                        if (keyMap.has(key))
                                            throw `Duplicate key '${key}'`;
                                        keyMap.set(key, chRng);
                                    }
                                    chRng.key = key;
                                }
                                else {
                                    if (chRng.fragm) {
                                        parN.insertBefore(chRng.fragm, nxChR?.FirstOrNext || bfor);
                                        chRng.fragm = N;
                                    }
                                    else
                                        while (T) {
                                            if (nxChR == chRng)
                                                nxChR = nxChR.next;
                                            else {
                                                if (nwMap.get(nxChR.key)?.idx > idx + 2) {
                                                    let fr = nxChR.fragm = D.createDocumentFragment();
                                                    for (let node of nxChR.Nodes())
                                                        fr.appendChild(node);
                                                    nxChR = nxChR.next;
                                                    continue;
                                                }
                                                chRng.prev.next = chRng.next;
                                                if (chRng.next)
                                                    chRng.next.prev = chRng.prev;
                                                let nxNode = nxChR?.FirstOrNext || bfor;
                                                for (let node of chRng.Nodes())
                                                    parN.insertBefore(node, nxNode);
                                            }
                                            break;
                                        }
                                    chRng.next = nxChR;
                                    chRng.text = `${letNm}(${idx})`;
                                    if (prRange)
                                        prRange.next = chRng;
                                    else
                                        rng.child = chRng;
                                    sub.rng = chRng;
                                    chArea = PrepArea(N, sub, '').sub;
                                    sub.parR = N;
                                }
                                chRng.prev = prRange;
                                prRange = chRng;
                                if (hash == N
                                    || hash != chRng.hash
                                        && (chRng.hash = hash, T)) {
                                    if (bReact && (bCr || item != chRng.rvars[0])) {
                                        RVAR_Light(item, dUpd && [dUpd()]);
                                        if (chRng.subs)
                                            item._Subs = chRng.rvars[0]._Subs;
                                    }
                                    vLet(item, T);
                                    vIdx(idx, T);
                                    vPrev(prItem, T);
                                    vNext(nxItem, T);
                                    await bodyBldr(chArea);
                                    if (bReact)
                                        if (chRng.subs)
                                            assignEnv(chRng.subs.env, env);
                                        else {
                                            item.Subscribe(chRng.subs = Subscriber(chArea, bodyBldr, chRng.child));
                                            chRng.rvars = [item];
                                        }
                                }
                                prItem = item;
                            }
                            if (prRange)
                                prRange.next = N;
                            else
                                rng.child = N;
                        }
                        finally {
                            RestEnv(svEnv);
                        }
                    };
                    if (iterable instanceof Promise) {
                        let subEnv = { env: CloneEnv(env), onerr, onsuc };
                        rng.rvars = [RVAR(N, iterable, N, rng.subs =
                                async (iter) => {
                                    let save = { env, onerr, onsuc };
                                    ({ env, onerr, onsuc } = subEnv);
                                    try {
                                        await pIter(iter);
                                    }
                                    finally {
                                        ({ env, onerr, onsuc } = save);
                                    }
                                })];
                    }
                    else
                        await pIter(iterable);
                };
            }
            else {
                let nm = atts.g('of', T, T).toLowerCase(), CS = this.ctSigns.get(nm);
                if (!CS)
                    throw `Missing attribute [let]`;
                let ck = CS[1], ixVar = this.newV(idxNm), bodyBldr = await this.CompChildNodes(srcElm);
                return async function FOREACH_Slot(ar) {
                    let { sub } = PrepArea(srcElm, ar), saved = SaveEnv(), slotDef = env.C[ck];
                    ixVar();
                    try {
                        let idx = 0;
                        for (let slotBldr of slotDef.templates) {
                            ixVar(idx++, T);
                            env.C[ck] = { nm: nm, templates: [slotBldr], CEnv: slotDef.CEnv };
                            await bodyBldr(sub);
                        }
                    }
                    finally {
                        env.C[ck] = slotDef;
                        RestEnv(saved);
                    }
                };
            }
        }
        finally {
            this.RestoreCont(saved);
        }
    }
    ParseSignat(elmSignat, bIsSlot) {
        let signat = new Signature(elmSignat, bIsSlot), s;
        for (let attr of elmSignat.attributes) {
            if (signat.RestP)
                throw `Rest parameter must be the last`;
            let m = /^(#|@|\.\.\.|_|)(.*?)(\?)?$/.exec(attr.name);
            if (m[1] != '_') {
                let param = {
                    mode: m[1],
                    nm: m[2],
                    pDflt: m[1] == '...' ? () => E
                        : attr.value != ''
                            ? (m[1] == '#' ? this.CompJScript(attr.value, attr.name) : this.CompString(attr.value, attr.name))
                            : m[3] ? /^on/.test(m[2]) ? () => _ => N : dU
                                : N
                };
                signat.Params.push(param);
                if (m[1] == '...')
                    signat.RestP = param;
            }
        }
        for (let elmSlot of elmSignat.children) {
            mapNm(signat.Slots, s = this.ParseSignat(elmSlot, T));
            if (/^content/.test(s.nm)) {
                if (signat.CSlot)
                    throw 'Multiple content slots';
                signat.CSlot = s;
            }
        }
        return signat;
    }
    async CompComponent(srcElm, atts) {
        let bldr, bRecurs = atts.gB('recursive'), { wspc } = this, signats = [], templates = [], { head } = this, encStyles = atts.gB('encapsulate') && (this.head = srcElm.ownerDocument.createDocumentFragment()).children, save = this.SaveCont();
        try {
            let arr = Array.from(srcElm.children), elmSign = arr.shift(), elmTempl = arr.pop();
            if (!elmSign)
                throw 'Missing signature(s)';
            if (!elmTempl || !/^TEMPLATES?$/.test(elmTempl.nodeName))
                throw 'Missing template(s)';
            for (let elm of /^SIGNATURES?$/.test(elmSign.nodeName) ? elmSign.children : [elmSign])
                signats.push(this.ParseSignat(elm));
            if (bRecurs)
                this.NewConstructs(signats);
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
        let DefConstrs = this.NewConstructs(signats);
        this.wspc = wspc;
        return async function COMPONENT(ar) {
            let constr = templates.map(C => ({ ...C }));
            if (bRecurs)
                DefConstrs(constr);
            let saved = SaveEnv();
            try {
                bldr && await R.ErrHandling(bldr, srcElm, ar);
                let CEnv = CloneEnv(env);
                for (let c of constr)
                    c.CEnv = CEnv;
            }
            finally {
                RestEnv(saved);
            }
            if (!bRecurs)
                DefConstrs(constr);
        };
    }
    async CompTempl(signat, contentNode, srcElm, bIsSlot, encStyles, atts) {
        let saved = this.SaveCont();
        try {
            let myAtts = atts || new Atts(srcElm), lvars = signat.Params.map(({ mode, nm }) => [nm, this.newV((myAtts.g(mode + nm) ?? myAtts.g(nm, bIsSlot)) || nm)]), DC = this.NewConstructs(signat.Slots.values());
            if (!atts)
                myAtts.ChkNoAttsLeft();
            this.wspc = this.rspc = 1;
            let builder = await this.CompChildNodes(contentNode), Cnm = signat.nm, custNm = /^[A-Z].*-/.test(Cnm) ? Cnm : `rhtml-${Cnm}`;
            return async function TEMPLATE(ar, args, mSlotTemplates, slotEnv) {
                let saved = SaveEnv(), i = 0;
                try {
                    for (let [nm, lv] of lvars) {
                        let arg = args[nm];
                        lv(arg !== U ? arg : signat.Params[i]?.pDflt?.());
                        i++;
                    }
                    DC(mapIter(mSlotTemplates, ([nm, templates]) => ({ nm, templates, CEnv: slotEnv, Cnm })));
                    if (encStyles) {
                        let { rng: elmRange, chArea, bCr } = PrepElm(srcElm, ar, custNm), elm = elmRange.node, shadow = elm.shadowRoot || elm.attachShadow({ mode: 'open' });
                        if (bCr)
                            for (let style of encStyles)
                                shadow.appendChild(style.cloneNode(T));
                        if (signat.RestP)
                            ApplyMod(elm, { mt: 8, nm: N, depV: null }, args[signat.RestP.nm], bCr);
                        chArea.parN = shadow;
                        ar = chArea;
                    }
                    await builder(ar);
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
    async CompInstance(srcElm, atts, [signat, ck]) {
        if (signat.prom)
            await signat.prom;
        let { RestP, CSlot } = signat, getArgs = [], SBldrs = new Map();
        for (let [nm] of signat.Slots)
            SBldrs.set(nm, []);
        for (let { mode, nm, pDflt } of signat.Params)
            if (mode == '@') {
                let attVal = atts.g(mode + nm, !pDflt);
                getArgs.push(attVal
                    ? [nm, this.CompJScript(attVal, mode + nm),
                        this.CompJScript(`ORx=>{${attVal}=ORx}`, nm)
                    ]
                    : [nm, U, dU]);
            }
            else if (mode != '...') {
                let dH = this.CompParam(atts, nm, !pDflt);
                if (dH)
                    getArgs.push([nm, dH]);
            }
        let slotElm, slot;
        for (let node of Array.from(srcElm.children))
            if ((slot = signat.Slots.get((slotElm = node).localName))
                && slot != CSlot) {
                SBldrs.get(slotElm.localName).push(await this.CompTempl(slot, slotElm, slotElm, T));
                srcElm.removeChild(node);
            }
        if (CSlot)
            SBldrs.get(CSlot.nm).push(await this.CompTempl(CSlot, srcElm, srcElm, T, N, atts));
        if (RestP) {
            let modifs = this.CompAttribs(atts);
            getArgs.push([
                RestP.nm,
                () => modifs.map(M => ({ M, value: M.depV() }))
            ]);
        }
        atts.ChkNoAttsLeft();
        this.wspc = 3;
        return async function INSTANCE(ar) {
            let IEnv = env, { rng, sub, bCr } = PrepArea(srcElm, ar), cdef = GetC(env, ck), args = rng.res || (rng.res = {});
            if (!cdef)
                return;
            ro = T;
            for (let [nm, dGet, dSet] of getArgs)
                if (!dSet)
                    args[nm] = dGet();
                else if (bCr)
                    args[nm] = RVAR('', dGet && dGet(), N, dSet());
                else if (dGet)
                    args[nm].V = dGet();
            ro = F;
            env = cdef.CEnv;
            try {
                for (let template of cdef.templates)
                    await template(sub, args, SBldrs, signat.bIsSlot && signat.Slots.size ? CloneEnv(IEnv) : IEnv);
            }
            finally {
                env = IEnv;
            }
        };
    }
    async CompHTMLElement(srcElm, atts, dTagName) {
        let nm = dTagName ? N : srcElm.localName.replace(/\.+$/, ''), preWs = this.wspc, postWs;
        if (this.setPRE.has(nm)) {
            this.wspc = 4;
            postWs = 1;
        }
        else if (reBlock.test(nm))
            this.wspc = this.rspc = postWs = 1;
        else if (reInline.test(nm)) {
            this.wspc = this.rspc = 1;
            postWs = 3;
        }
        if (preWs == 4)
            postWs = preWs;
        let modifs = this.CompAttribs(atts), childnodesBldr = await this.CompChildNodes(srcElm);
        if (postWs)
            this.wspc = postWs;
        return addP(async function ELEMENT(ar) {
            let { rng: { node }, chArea, bCr } = PrepElm(srcElm, ar, nm || dTagName());
            if (!ar.bRootOnly)
                await childnodesBldr(chArea);
            node.removeAttribute('class');
            if (node.hndlrs) {
                for (let { evType, listener } of node.hndlrs)
                    node.removeEventListener(evType, listener);
                node.hndlrs = [];
            }
            ApplyMods(node, modifs, bCr);
        }, 'ws', postWs == 1 || preWs < 4 && childnodesBldr.ws);
    }
    CompAttribs(atts) {
        let modifs = [], m;
        function addM(mt, nm, depV) {
            modifs.push({ mt, nm, depV });
        }
        for (let [nm, V] of atts) {
            try {
                if (m = /(.*?)\.+$/.exec(nm))
                    addM(0, nm, this.CompString(V, nm));
                else if (m = /^on(.*?)\.*$/i.exec(nm))
                    addM(5, m[0], this.AddErrH(this.CompHandlr(nm, V)));
                else if (m = /^#class[:.](.*)$/.exec(nm))
                    addM(3, m[1], this.CompJScript(V, nm));
                else if (m = /^(#)?style\.(.*)$/.exec(nm))
                    addM(4, CapProp(m[2]), m[1] ? this.CompJScript(V, nm) : this.CompString(V, nm));
                else if (nm == '+style')
                    addM(6, nm, this.CompJScript(V, nm));
                else if (nm == "+class")
                    addM(7, nm, this.CompJScript(V, nm));
                else if (m = /^([\*\+#!]+|@@?)(.*?)\.*$/.exec(nm)) {
                    let nm = altProps[m[2]] || m[2], setter;
                    if (/[@#]/.test(m[1])) {
                        let depV = this.CompJScript(V, nm);
                        if (/^on/.test(nm))
                            addM(5, nm, this.AddErrH(depV));
                        else
                            addM(1, nm, depV);
                    }
                    if (m[1] != '#') {
                        let dS = this.CompTarget(V), cnm;
                        setter = () => {
                            let S = dS();
                            return function () {
                                S(this[cnm || (cnm = ChkNm(this, nm))]);
                            };
                        };
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
    CompString(data, nm) {
        let rIS = this.rIS || (this.rIS = new RegExp(/(\\[${])|/.source
            + (this.Settings.bDollarRequired ? /\$/ : /\$?/).source
            + /\{((\{(\{.*?\}|.)*?\}|'(\\'|.)*?'|"(\\"|.)*?"|`(\\`|.)*?`|\\\}|.)*?)\}|$/.source, 'gs')), gens = [], ws = nm || this.Settings.bKeepWhiteSpace ? 4 : this.wspc, isTriv = T, bThis, lastIndex = rIS.lastIndex = 0, dep, m;
        while (T)
            if (!(m = rIS.exec(data))[1]) {
                let fixed = lastIndex < m.index ? data.slice(lastIndex, m.index) : N;
                if (fixed) {
                    fixed = fixed.replace(/\\([${}\\])/g, '$1');
                    if (ws < 4) {
                        fixed = fixed.replace(/[ \t\n\r]+/g, ' ');
                        if (ws <= 2 && !gens.length)
                            fixed = fixed.replace(/^ /, '');
                        if (this.rspc && !m[2] && rIS.lastIndex == data.length)
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
                }
                lastIndex = rIS.lastIndex;
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
        return dep;
    }
    CompPatt(patt, url) {
        let reg = '', lvars = [], regIS = /\\[{}]|\{((?:[^}]|\\\})*)\}|\?|\*|(\\.)|\[\^?(?:\\.|[^\\\]])*\]|$/gs;
        while (regIS.lastIndex < patt.length) {
            let ix = regIS.lastIndex, m = regIS.exec(patt), literals = patt.slice(ix, m.index);
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
        let v = atts.g(attName);
        return (v == N ? this.CompAttrExpr(atts, attName, bReq)
            : /^on/.test(attName) ? this.CompHandlr(attName, v)
                : this.CompString(v, attName));
    }
    CompAttrExpr(atts, att, bReq, check) {
        return this.CompJScript(atts.g(att, bReq, T), att, U, check);
    }
    CompTarget(expr, nm) {
        try {
            return this.CompJScript(`$=>(${expr})=$`, nm);
        }
        catch (e) {
            throw `Invalid left-hand side ` + e;
        }
    }
    CompHandlr(nm, text) {
        return /^#/.test(nm) ? this.CompJScript(text, nm)
            : this.CompJScript(`function(event){${text}\n}`, nm);
    }
    CompJScript(expr, descrip, delims = '""', check) {
        if (expr == N)
            return N;
        try {
            let rout = gEval(`'use strict';(function expr([${this.ctStr}]){return (${expr}\n)})`);
            return function () {
                try {
                    let t = rout.call(this, env), m = check?.(t);
                    if (m)
                        throw m;
                    return t;
                }
                catch (e) {
                    throw `${descrip ? `[${descrip}] ` : ''}${delims[0]}${Abbr(expr, 60)}${delims[1]}: ` + e;
                }
            };
        }
        catch (e) {
            throw `${descrip ? `[${descrip}] ` : ''}${delims[0]}${Abbr(expr, 60)}${delims[1]}: ` + e;
        }
    }
    CompName(nm) {
        let i = this.ctMap.get(nm);
        if (i == N)
            throw `Unknown name '${nm}'`;
        return () => env[i];
    }
    compAttrExprList(atts, attName, bReacts) {
        let list = atts.g(attName, F, T);
        if (list == N)
            return N;
        if (bReacts)
            for (let nm of split(list))
                this.cRvars.set(nm, F);
        return this.CompJScript(`[${list}\n]`, attName);
    }
    AddErrH(getHndlr) {
        return () => {
            let hndlr = getHndlr(), oE = onerr, oS = onsuc;
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
                    catch (e) {
                        if (!oE)
                            throw e;
                        oE(e);
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
        let m = D.getElementById(src);
        if (!m) {
            let d = parser.parseFromString(await this.FetchText(src), 'text/html'), b = d.body, e = b.firstElementChild;
            if (e?.tagName != 'MODULE')
                return conc(d.head.childNodes, b.childNodes);
            m = e;
        }
        else if (m.tagName != 'MODULE')
            throw `#${src} must be a <MODULE>`;
        return m.childNodes;
    }
}
RCompiler.iNum = 0;
export async function RFetch(input, init) {
    let r = await fetch(input, init);
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
        for (let a of elm.attributes)
            if (!/^_/.test(a.name))
                super.set(a.name, a.value);
    }
    g(nm, bReq, bHashAllowed) {
        let m = nm, v = super.get(m);
        if (v == N && bHashAllowed)
            v = super.get(m = '#' + nm);
        if (v != N)
            super.delete(m);
        else if (bReq)
            throw `Missing attribute [${nm}]`;
        return v;
    }
    gB(nm) {
        let v = this.g(nm), m = /^((false)|true)?$/i.exec(v);
        if (v != N) {
            if (!m)
                throw `@${nm}: invalid value`;
            return !m[2];
        }
    }
    ChkNoAttsLeft() {
        super.delete('hidden');
        if (super.size)
            throw `Unknown attribute(s): ${Array.from(super.keys()).join(',')}`;
    }
}
let R = new RCompiler(), altProps = { "class": "className", for: "htmlFor" }, genAtts = /^#?(?:((?:this)?reacts?on|on)|(?:(before)|on|after)((?:create|update|destroy)+)|on((error)-?|success))$/, reIdent = /^[A-Z_$][A-Z0-9_$]*$/i, reReserv = /^(break|case|catch|class|continue|debugger|default|delete|do|else|export|extends|finally|for|function|if|import|in|instanceof|new|return|super|switch|this|throw|try|typeof|var|void|while|with|enum|implements|interface|let|package|private|protected|public|static|yield|null|true|false)$/, words = 'accent|additive|align|angle|animation|ascent|aspect|auto|back(drop|face|ground)|backface|behavior|blend|block|border|bottom|box|break|caption|caret|character|clip|color|column(s$)?|combine|conic|content|counter|css|decoration|display|emphasis|empty|end|feature|fill|filter|flex|font|forced|frequency|gap|grid|hanging|hue|hyphenate|image|initial|inline|inset|iteration|justify|language|left|letter|line(ar)?|list|margin|mask|masonry|math|max|min|nav|object|optical|outline|overflow|padding|page|paint|perspective|place|play|pointer|rotate|position|print|radial|read|repeating|right|row(s$)?|ruby|rule|scale|scroll(bar)?|shape|size|snap|skew|skip|speak|start|style|tab(le)?|template|text|timing|top|touch|transform|transition|translate|underline|unicode|user|variant|variation|vertical|viewport|white|will|word|writing|^z', reCapit = new RegExp(`(${words})|.`, "g"), reBlock = /^(body|blockquote|d[dlt]|div|form|h\d|hr|li|ol|p|table|t[rhd]|ul|select|title)$/, reInline = /^(button|input|img)$/, reWS = /^[ \t\n\r]*$/, Cnms = {};
function ChkId(nm) {
    if (!reIdent.test(nm))
        throw `Invalid identifier '${nm}'`;
    if (reReserv.test(nm))
        throw `Reserved keyword '${nm}'`;
    return nm;
}
function CapProp(nm) {
    let b;
    return nm.replace(reCapit, (w, w1) => {
        let r = b ? w.slice(0, 1).toUpperCase() + w.slice(1) : w;
        b = w1;
        return r;
    });
}
function ChkNm(obj, nm) {
    if (Cnms[nm])
        return Cnms[nm];
    let c = nm, r = new RegExp(`^${nm}$`, 'i');
    if (!(nm in obj))
        for (let p in obj)
            if (r.test(p)) {
                c = p;
                break;
            }
    return Cnms[nm] = c;
}
function OuterOpenTag(elm, maxLen) {
    return Abbr(/<.*?(?=>)/s.exec(elm.outerHTML)[0], maxLen - 1) + '>';
}
function Abbr(s, m) {
    return (m && s.length > m
        ? s.slice(0, m - 3) + "..."
        : s);
}
function LAbbr(s, m = 1000) {
    return (m && s.length > m
        ? "... " + s.slice(s.length - m + 4)
        : s);
}
function mapNm(m, v) {
    m.set(v.nm, v);
}
function mapSet(m, nm, v) {
    if (v != N)
        m.set(nm, v);
    else
        m.delete(nm);
}
function* conc(R, S) {
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
    let e = D.createElement('div');
    ass(e.style, { color: 'crimson', fontFamily: 'sans-serif', fontSize: '10pt' });
    e.innerText = msg;
    return e;
}
function NoChildren(srcElm) {
    for (let node of srcElm.childNodes)
        if (srcElm.childElementCount
            || node.nodeType == Node.TEXT_NODE && !reWS.test(node.nodeValue))
            throw `<${srcElm.localName} ...> must be followed by </${srcElm.localName}>`;
}
function copySSheets(S, D) {
    for (let SSheet of S.styleSheets) {
        let DSheet = D.head.appendChild(D.createElement('style')).sheet;
        for (let rule of SSheet.cssRules)
            DSheet.insertRule(rule.cssText);
    }
}
export function* range(from, count, step = 1) {
    if (count === U) {
        count = from;
        from = 0;
    }
    for (let i = 0; i < count; i++)
        yield from + i * step;
}
class DocLoc extends _RVAR {
    constructor() {
        super('docLocation', L.href);
        this.query = new Proxy({}, {
            get(_, key) { return DL.url.searchParams.get(key); },
            set(_, key, val) { DL.V = DL.search(key, val); return true; }
        });
        W.addEventListener('popstate', _ => this.V = L.href);
        this.Subscribe(loc => this.url = new URL(loc), T, T);
        this.Subscribe(_ => {
            let h = this.url.href;
            if (h != L.href)
                history.pushState(N, N, h);
            ScrollToHash();
        }, F, T);
    }
    get subpath() { return L.pathname.slice(this.basepath.length); }
    set subpath(s) {
        this.url.pathname = this.basepath + s;
        this.V = this.url.href;
    }
    search(fld, val) {
        let U = new URL(this.V);
        mapSet(U.searchParams, fld, val);
        return U.href;
    }
    RVAR(fld, df, nm = fld) {
        let R = RVAR(nm, N, N, v => this.query[fld] = v);
        this.Subscribe(_ => R.V = this.query[fld] ?? df, T);
        return R;
    }
}
const DL = new DocLoc(), reroute = arg => {
    if (typeof arg == 'object') {
        if (arg.ctrlKey)
            return;
        arg.preventDefault();
        arg = arg.target.href;
    }
    DL.V = new URL(arg, DL.V).href;
};
export { DL as docLocation, reroute };
function ScrollToHash() {
    if (L.hash)
        setTimeout((_ => D.getElementById(L.hash.slice(1))?.scrollIntoView()), 6);
}
ass(G, { RVAR, range, reroute, RFetch });
if (/^rhtml$/i.test(D.body.getAttribute('type')))
    setTimeout(RCompile, 0);
