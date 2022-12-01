const U = undefined, N = null, T = true, F = false, E = [], W = window, D = document, L = location, G = self, defaults = {
    bTiming: F,
    bAbortOnError: F,
    bShowErrors: T,
    bSubfile: F,
    basePattern: '/',
    preformatted: E,
    bNoGlobals: F,
    bDollarRequired: F,
    bSetPointer: T,
    bKeepWhiteSpace: F,
    bKeepComments: F,
    storePrefix: "RVAR_"
}, parser = new DOMParser(), gEval = eval, ass = Object.assign, aIb = (b, iB) => ass(b, { iB }), now = () => performance.now(), dU = () => U, dumB = async (ar) => { PrepRange(N, ar); }, childWins = new Set(), RModules = new Map();
class Range {
    constructor(ar, node, text) {
        this.text = text;
        this.node = node;
        if (ar) {
            let p = ar.parR, q = ar.prevR;
            if (p && !p.node)
                this.parR = p;
            if (q)
                q.next = this;
            else if (p)
                p.child = this;
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
        let { node, child: c } = this;
        if (node && par) {
            par.removeChild(node);
            par = N;
        }
        this.child = N;
        while (c) {
            if (c.bfDest)
                c.bfDest.call(c.node || par);
            c.erase(c.parN || par);
            if (c.rvars)
                for (let rv of c.rvars)
                    rv._Subs.delete(c.subs);
            if (c.onDest)
                c.onDest.call(c.node || par);
            c = c.next;
        }
    }
}
class Context {
    constructor(C, b) {
        ass(this, C || {
            d: 0, L: 0, M: 0, ct: '',
            varM: new Map(), csMap: new Map()
        });
        if (b && C) {
            this.varM = new Map(this.varM);
            this.csMap = new Map(this.csMap);
        }
    }
    max(C) {
        return ass(C.L > this.L ? C : this, { N: Math.min(this.M, C.M) });
    }
}
function getV([F, i], d, e = env) {
    for (; F < d; F++)
        e = e[0];
    return e[i];
}
function PrepRange(srcE, ar, text = '', nWipe, res) {
    let { parN, r, bR } = ar, sub = { parN, bR }, cr = !r;
    if (cr) {
        sub.srcN = ar.srcN;
        sub.bfor = ar.bfor;
        if (srcE)
            text = srcE.tagName + (text && ' ') + text;
        (r = sub.parR = new Range(ar, N, text)).res = res;
    }
    else {
        sub.r = r.child;
        ar.r = r.next;
        if (cr = nWipe && (nWipe > 1 || res != r.res)) {
            r.res = res;
            (sub.parR = r).erase(parN);
            sub.r = N;
            sub.bfor = r.Next;
        }
    }
    return { r, sub, cr };
}
function PrepElm(srcE, ar, tag = srcE.tagName) {
    let r = ar.r, cr = !r;
    if (cr)
        r = new Range(ar, ar.srcN == srcE
            ? (srcE.innerHTML = "", srcE)
            : ar.parN.insertBefore(D.createElement(tag), ar.bfor));
    else
        ar.r = r.next;
    nodeCnt++;
    return {
        r,
        chAr: {
            parN: r.node,
            r: r.child,
            bfor: N,
            parR: r
        },
        cr
    };
}
function PrepCharData(ar, content, bComm) {
    let r = ar.r;
    if (!r)
        new Range(ar, ar.parN.insertBefore(bComm ? D.createComment(content) : D.createTextNode(content), ar.bfor));
    else {
        r.node.data = content;
        ar.r = r.next;
    }
    nodeCnt++;
}
export async function RCompile(elm = D.body, settings) {
    try {
        let { basePattern } = R.Settings = { ...defaults, ...settings }, m = L.href.match(`^.*(${basePattern})`);
        R.FilePath = L.origin + (DL.basepath = m ? (new URL(m[0])).pathname.replace(/[^/]*$/, '') : '');
        await R.Compile(elm);
        start = now();
        nodeCnt = 0;
        let ar = { parN: elm.parentElement, srcN: elm, r: N };
        await R.Build(ar);
        W.addEventListener('pagehide', () => childWins.forEach(w => w.close()));
        R.log(`Built ${nodeCnt} nodes in ${(now() - start).toFixed(1)} ms`);
        ScrollToHash();
    }
    catch (e) {
        alert(`OtoReact error: ` + LAbbr(e));
    }
}
function NewEnv() {
    return [N];
}
function SetLVars(vars, data) {
    vars.forEach((v, i) => v(data[i]));
}
class Signature {
    constructor(srcE) {
        this.srcE = srcE;
        this.Params = [];
        this.Slots = new Map();
        this.nm = srcE.tagName;
    }
    IsCompat(sig) {
        if (!sig)
            return;
        let c = T, mParams = new Map(mapI(sig.Params, p => [p.nm, !!p.pDflt]));
        for (let { nm, pDflt } of this.Params)
            if (mParams.has(nm)) {
                c && (c = !pDflt || mParams.get(nm));
                mParams.delete(nm);
            }
            else
                c = F;
        for (let pDflt of mParams.values())
            c && (c = pDflt);
        for (let [nm, slotSig] of this.Slots)
            c && (c = sig.Slots.get(nm)?.IsCompat(slotSig));
        return c;
    }
}
class _RVAR {
    constructor(name, init, store, storeNm) {
        this._Subs = new Set();
        this.name = name || storeNm;
        if (name)
            G[name] = this;
        if (store) {
            let sNm = storeNm || R.Settings.storePrefix + name, s = store.getItem(sNm);
            if (s)
                try {
                    init = JSON.parse(s);
                }
                catch { }
            this.Subscribe(v => store.setItem(sNm, JSON.stringify(v ?? N)));
        }
        init instanceof Promise ?
            init.then(v => this.V = v, onerr)
            : (this.v = init);
    }
    Subscribe(s, bImmediate, cr = bImmediate) {
        if (s) {
            if (cr)
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
        return t => t instanceof Promise ?
            ((this.V = U), t.then(v => this.V = v, onerr))
            : (this.V = t);
    }
    get Clear() {
        return _ => DVars.has(this) || (this.V = U);
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
        if (b) {
            DVars.add(this);
            RUpdate();
        }
    }
    toString() {
        return this.v?.toString() ?? '';
    }
}
function Subscriber({ parN, bR }, bl, r, x) {
    if (r)
        r.updated = updCnt;
    let sAr = { parN, bR, r }, subEnv = { env, onerr, onsuc };
    return ass(async (_) => {
        let r = sAr.r;
        if (!r || r.updated < updCnt) {
            ({ env, onerr, onsuc } = subEnv);
            if (r && !bR)
                r.updated = updCnt;
            await bl({ ...sAr }, x, T);
        }
    }, { sAr });
}
let env, onerr, onsuc, DVars = new Set(), bUpdating, hUpdate, ro = F, updCnt = 0, nodeCnt = 0, start;
function RUpdate() {
    if (!bUpdating && !hUpdate)
        hUpdate = setTimeout(DoUpdate, 5);
}
export async function DoUpdate() {
    hUpdate = N;
    if (!R.bldr || bUpdating)
        return;
    bUpdating = T;
    try {
        nodeCnt = 0;
        start = now();
        while (DVars.size) {
            updCnt++;
            let dv = DVars;
            DVars = new Set();
            for (let rv of dv)
                for (let subs of rv._Subs)
                    if (!subs.bImm)
                        try {
                            let P = subs(rv instanceof _RVAR ? rv.v : rv);
                            if (subs.sAr)
                                await P;
                        }
                        catch (e) {
                            console.log(e = `ERROR: ` + LAbbr(e));
                            alert(e);
                        }
        }
        R.log(`Updated ${nodeCnt} nodes in ${(now() - start).toFixed(1)} ms`);
    }
    finally {
        env = U;
        bUpdating = F;
    }
}
export function RVAR(nm, value, store, subs, storeName) {
    return new _RVAR(nm, value, store, storeName).Subscribe(subs, T, F);
}
function RVAR_Light(t, updTo) {
    if (!t._Subs) {
        t._Subs = new Set();
        t._UpdTo = updTo;
        Object.defineProperty(t, 'U', { get: () => {
                if (!ro) {
                    DVars.add(t);
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
function ApplyMod(elm, M, val, cr) {
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
            val && elm.classList.add(nm);
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
            (function ACL(v) {
                if (v)
                    switch (typeof v) {
                        case 'string':
                            elm.classList.add(v);
                            break;
                        case 'object':
                            if (v)
                                if (Array.isArray(v))
                                    v.forEach(ACL);
                                else
                                    for (let [nm, b] of Object.entries(v))
                                        b && ACL(nm);
                            break;
                        default: throw `Invalid value`;
                    }
            })(val);
            break;
        case 8:
            for (let { M, v } of val || E)
                ApplyMod(elm, M, v, cr);
            break;
        case 9:
            cr && val.call(elm);
            break;
        case 10:
            !cr && val.call(elm);
    }
}
function ApplyMods(elm, mods, cr) {
    ro = T;
    for (let M of mods)
        ApplyMod(elm, M, M.depV.call(elm), cr);
    ro = F;
}
class RCompiler {
    constructor(RC, FilePath, CT = RC?.CT) {
        this.num = RCompiler.iNum++;
        this.cRvars = {};
        this.rActs = [];
        this.setPRE = new Set(['PRE']);
        this.ws = 1;
        this.rspc = T;
        this.srcNodeCnt = 0;
        this.Settings = RC ? { ...RC.Settings } : { ...defaults };
        this.FilePath = FilePath || RC?.FilePath;
        this.doc = RC?.doc || D;
        this.head = RC?.head || this.doc.head;
        this.CT = new Context(CT, T);
    }
    async Framed(Comp) {
        let { CT, rActs } = this, { ct, d, L, M } = CT, A = rActs.length, nf = L - M > 6;
        if (nf) {
            CT.ct = `[${ct}]`;
            CT.d++;
            CT.L = CT.M = 0;
        }
        try {
            return await Comp((sub, r) => {
                if (!r)
                    ({ r, sub } = PrepRange(N, sub));
                let e = env;
                env = nf
                    ? r.val || (r.val = [e]) : ass(r.val || (r.val = []), e);
                return { sub, ES: () => { env = e; } };
            });
        }
        finally {
            ass(this.CT, { ct, d, L, M });
            while (rActs.length > A)
                rActs.pop()();
        }
    }
    SScope() {
        let { CT, rActs } = this, { ct, L } = CT, A = rActs.length;
        return () => {
            CT.ct = ct
                + ','.repeat(CT.L - L);
            while (rActs.length > A)
                rActs.pop()();
        };
    }
    LVar(nm) {
        if (!(nm = nm?.trim()))
            var lv = dU;
        else {
            if (!/^[A-Z_$][A-Z0-9_$]*$/i.test(nm))
                throw `Invalid identifier '${nm}'`;
            if (reReserv.test(nm))
                throw `Reserved keyword '${nm}'`;
            let { CT } = this, L = ++CT.L, M = CT.varM, p = M.get(nm);
            this.rActs.push(() => mapSet(M, nm, p));
            M.set(nm, [CT.d, L]);
            CT.ct = CT.ct.replace(new RegExp(`\\b${nm}\\b`), '') + ',' + nm;
            lv = (v => (env[L] = v));
        }
        lv.nm = nm;
        return lv;
    }
    LVars(varlist) {
        return Array.from(split(varlist), nm => this.LVar(nm));
    }
    LCons(listS) {
        let { CT } = this, { csMap, M } = CT;
        for (let S of listS) {
            let p = csMap.get(S.nm);
            this.rActs.push(() => mapSet(csMap, S.nm, p));
            csMap.set(S.nm, [S, [CT.d, --CT.M]]);
        }
        return (CDefs) => {
            let i = M;
            for (let C of CDefs)
                env[--i] = C;
        };
    }
    async Compile(elm, settings = {}, childnodes) {
        ass(this.Settings, settings);
        for (let tag of this.Settings.preformatted)
            this.setPRE.add(tag.toUpperCase());
        let t0 = now();
        this.bldr =
            (childnodes
                ? await this.CChilds(elm, childnodes)
                : await this.CElm(elm.parentElement, elm, T)) || dumB;
        this.log(`${this.num} Compiled ${this.srcNodeCnt} nodes in ${(now() - t0).toFixed(1)} ms`);
        return this.bldr;
    }
    log(msg) {
        if (this.Settings.bTiming)
            console.log(new Date().toISOString().substring(11) + ' ' + msg);
    }
    async Build(ar) {
        let saveR = R;
        R = this;
        env = NewEnv();
        await this.bldr(ar);
        R = saveR;
    }
    async CChilds(srcParent, childNodes = srcParent.childNodes) {
        let ES = this.SScope();
        try {
            return await this.CIter(srcParent, childNodes);
        }
        finally {
            ES();
        }
    }
    async CIter(srcP, iter) {
        let { rspc } = this, arr = Array.from(iter);
        while (rspc && arr.length && reWS.test(arr[arr.length - 1].nodeValue))
            arr.pop();
        let bldrs = await this.CArr(srcP, arr, this.rspc);
        return bldrs.length ? aIb(async function Iter(ar) {
            for (let b of bldrs)
                await b(ar);
        }, bldrs.every(b => b.iB))
            : N;
    }
    async CArr(srcP, arr, rspc, i = 0) {
        let bldrs = [], L = arr.length, rv;
        while (i < L) {
            let srcN = arr[i++], bl;
            this.rspc = i == L && rspc;
            switch (srcN.nodeType) {
                case Node.ELEMENT_NODE:
                    this.srcNodeCnt++;
                    bl = await this.CElm(srcP, srcN);
                    if (rv = bl?.auto) {
                        let a = this.cRvars[rv], bs = await this.CArr(this.cRvars[rv] = srcP, arr, rspc, i);
                        i = L;
                        bldrs.push(bl);
                        bl = N;
                        if (bs.length && this.cRvars[rv]) {
                            bl = aIb(async function Auto(ar) {
                                if (!ar.r) {
                                    let r = ar.prevR, rv = r.val, s = rv._Subs.size, subs = Subscriber(ar, Auto, r);
                                    for (let b of bs)
                                        await b(ar);
                                    let { sAr } = subs;
                                    r = r ? r.next : ar.parR.child;
                                    if (rv._Subs.size == s && r) {
                                        (sAr.r = r).updated = updCnt;
                                        rv.Subscribe(subs);
                                    }
                                }
                                else
                                    for (let b of bs)
                                        await b(ar);
                            }, bs.every(b => b.iB));
                        }
                        else
                            bldrs.push(...bs);
                        this.cRvars[rv] = a;
                    }
                    break;
                case Node.TEXT_NODE:
                    this.srcNodeCnt++;
                    let str = srcN.nodeValue;
                    let getText = this.CString(str), { fixed } = getText;
                    if (fixed !== '') {
                        bl = aIb(fixed
                            ? async (ar) => PrepCharData(ar, fixed)
                            : async (ar) => PrepCharData(ar, getText()), fixed == ' ' && 2);
                        if (this.ws < 4)
                            this.ws = / $/.test(str) ? 2 : 3;
                    }
                    break;
                case Node.COMMENT_NODE:
                    if (this.Settings.bKeepComments) {
                        let getText = this.CString(srcN.nodeValue, 'Comment');
                        bl =
                            aIb(async (ar) => PrepCharData(ar, getText(), T), 1);
                    }
            }
            if (bl ? bl.iB : this.rspc)
                prune();
            if (bl)
                bldrs.push(bl);
        }
        function prune() {
            let i = bldrs.length, isB;
            while (i-- && (isB = bldrs[i][1]))
                if (isB === T)
                    bldrs.splice(i, 1);
        }
        if (rspc)
            prune();
        return bldrs;
    }
    async CElm(srcPrnt, srcE, bUnhide) {
        try {
            let tag = srcE.tagName, atts = new Atts(srcE), CTL = this.rActs.length, reacts = [], befor = [], after = [], dOnerr, dOnsuc, bl, iB, auto, m, nm, constr = this.CT.csMap.get(tag), dIf = this.CAttExp(atts, 'if');
            for (let att of atts.keys())
                if (m =
                    /^#?(?:((?:this)?reacts?on|(on)|(hash))|(?:(before)|on|after)((?:create|update|destroy)+)|on((error)-?|success))$/
                        .exec(att))
                    if (m[1])
                        m[2] && tag != 'REACT'
                            || m[3] && tag == 'FOR'
                            || reacts.push({ att, dRV: this.CAttExpList(atts, att, T) });
                    else {
                        let txt = atts.g(att);
                        if (nm = m[5])
                            (m[4] ? befor : after).push({ att, txt, C: /c/i.test(nm), U: /u/i.test(nm), D: /y/i.test(nm) });
                        else {
                            let hndlr = this.CHandlr(att, txt);
                            if (m[7])
                                (dOnerr = hndlr).bBldr = !/-$/.test(att);
                            else
                                dOnsuc = hndlr;
                        }
                    }
            if (bUnhide)
                atts.set('#hidden', 'false');
            if (constr)
                bl = await this.CInstance(srcE, atts, constr);
            else {
                switch (tag) {
                    case 'DEF':
                    case 'DEFINE':
                        {
                            NoChildren(srcE);
                            let rv = atts.g('rvar'), t = '@value', t_val = rv && atts.g(t), dSet = t_val && this.CTarget(t_val, t), dGet = t_val ? this.CJScript(t_val, t) : this.CParam(atts, 'value'), dUpd = rv && this.CAttExp(atts, 'updates'), dSto = rv && this.CAttExp(atts, 'store'), dSNm = dSto && this.CParam(atts, 'storename'), bUpd = atts.gB('reacting') || atts.gB('updating') || t_val, vLet = this.LVar(rv || atts.g('let') || atts.g('var', T)), onMod = rv && this.CParam(atts, 'onmodified');
                            bl = async function DEF(ar, _, bReact) {
                                let { cr, r } = PrepRange(srcE, ar);
                                if (cr || bUpd || bReact) {
                                    ro = T;
                                    let v = dGet?.();
                                    ro = F;
                                    if (rv)
                                        if (cr) {
                                            let upd = dUpd?.();
                                            vLet(r.val =
                                                RVAR(N, v, dSto?.(), dSet?.(), dSNm?.() || rv))
                                                .Subscribe(upd?.SetDirty?.bind(upd))
                                                .Subscribe(onMod?.());
                                        }
                                        else
                                            r.val.Set(v);
                                    else
                                        vLet(v);
                                }
                            };
                            if (!onMod)
                                auto = rv;
                            iB = 1;
                        }
                        break;
                    case 'IF':
                    case 'CASE':
                        bl = await this.CCase(srcE, atts);
                        break;
                    case 'FOR':
                        bl = await this.CFor(srcE, atts);
                        break;
                    case 'MODULE':
                        atts.g('id');
                        break;
                    case 'INCLUDE':
                        let src = atts.g('src', T);
                        bl = await (srcE.children.length || srcE.textContent.trim()
                            ? this.CChilds(srcE)
                            : this.Framed(async (SScope) => {
                                let C = new RCompiler(this, this.GetPath(src)), task = C.Compile(N, { bSubfile: T }, await this.fetchModule(src));
                                return async function INCLUDE(ar) {
                                    let t0 = now(), bl = await task, { sub, ES } = SScope(ar);
                                    start += now() - t0;
                                    try {
                                        await bl(sub);
                                    }
                                    finally {
                                        ES();
                                    }
                                };
                            }));
                        break;
                    case 'IMPORT':
                        {
                            let src = atts.g('src', T), bIncl = atts.gB('include'), lvars = this.LVars(atts.g('defines')), bAsync = atts.gB('async'), listImps = Array.from(srcE.children).map(ch => this.ParseSign(ch)), DC = this.LCons(listImps), promModule = RModules.get(src);
                            if (!promModule) {
                                let C = new RCompiler(this, this.GetPath(src), new Context());
                                C.Settings.bSubfile = T;
                                promModule = this.fetchModule(src).then(async (nodes) => {
                                    let bl = await C.CIter(N, nodes), { CT } = C;
                                    for (let clientSig of listImps) {
                                        let signat = CT.csMap.get(clientSig.nm);
                                        if (!signat)
                                            throw `<${clientSig.nm}> is missing in '${src}'`;
                                        if (bAsync && !clientSig.IsCompat(signat[0]))
                                            throw `Import signature ${clientSig.srcE.outerHTML} is incompatible with module signature ${signat[0].srcE.outerHTML}`;
                                    }
                                    for (let v of lvars)
                                        if (!(v.k = CT.varM.get(v.nm)))
                                            throw `Module does not define '${v.nm}'`;
                                    return [bl, CT];
                                });
                                RModules.set(src, promModule);
                            }
                            if (!bAsync) {
                                let prom = promModule.then(M => {
                                    for (let sig of listImps)
                                        ass(sig, M[1].csMap.get(sig.nm)[0]);
                                });
                                for (let sig of listImps)
                                    sig.prom = prom;
                            }
                            bl = async function IMPORT(ar) {
                                let { sub, cr, r } = PrepRange(srcE, ar);
                                if (cr || bIncl) {
                                    let [bl, { d, csMap }] = await promModule, saveEnv = env, MEnv = env = r.val || (r.val = NewEnv());
                                    await bl?.(bIncl ? sub : { parN: D.createDocumentFragment() });
                                    env = saveEnv;
                                    DC(mapI(listImps, S => getV(csMap.get(S.nm)[1], d, MEnv)));
                                    for (let lv of lvars)
                                        lv(getV(lv.k, d, MEnv));
                                }
                            };
                            iB = 1;
                        }
                        break;
                    case 'REACT':
                        try {
                            var ES = this.SScope(), b = bl = await this.CChilds(srcE);
                        }
                        finally {
                            ES();
                        }
                        iB = !b && 2;
                        if (atts.gB('renew')) {
                            bl = function renew(sub) {
                                return b(PrepRange(srcE, sub, 'renew', 2).sub);
                            };
                        }
                        break;
                    case 'RHTML':
                        {
                            NoChildren(srcE);
                            let dSrc = this.CParam(atts, 'srctext', T), mods = this.CAtts(atts), C = new RCompiler(N, R.FilePath);
                            this.ws = 1;
                            bl = async function RHTML(ar) {
                                let src = dSrc(), { r, cr } = PrepElm(srcE, ar, 'rhtml-rhtml'), { node } = r;
                                ApplyMods(node, mods, cr);
                                if (ar.prevR || src != r.res) {
                                    r.res = src;
                                    let svEnv = env, sRoot = C.head = node.shadowRoot || node.attachShadow({ mode: 'open' }), tempElm = D.createElement('rhtml'), sAr = {
                                        parN: sRoot,
                                        parR: r.child || (r.child = new Range(N, N, 'Shadow'))
                                    };
                                    r.child.erase(sRoot);
                                    sRoot.innerHTML = '';
                                    try {
                                        tempElm.innerHTML = src;
                                        C.CT = new Context();
                                        await C.Compile(tempElm, { bSubfile: T, bTiming: R.Settings.bTiming }, tempElm.childNodes);
                                        await C.Build(sAr);
                                    }
                                    catch (e) {
                                        sRoot.appendChild(createErrNode(`Compile error: ` + e));
                                    }
                                    finally {
                                        env = svEnv;
                                    }
                                }
                            };
                        }
                        break;
                    case 'SCRIPT':
                        bl = await this.CScript(srcPrnt, srcE, atts);
                        iB = 1;
                        break;
                    case 'STYLE':
                        this.head.appendChild(srcE);
                        break;
                    case 'COMPONENT':
                        bl = await this.CComponent(srcE, atts);
                        iB = 1;
                        break;
                    case 'DOCUMENT':
                        {
                            let vDoc = this.LVar(atts.g('name', T)), RC = new RCompiler(this), bEncaps = atts.gB('encapsulate'), vParams = RC.LVars(atts.g('params')), vWin = RC.LVar(atts.g('window')), docBldr = ((RC.head = D.createElement('DocumentFragment')), await RC.CChilds(srcE));
                            bl = async function DOCUMENT(ar) {
                                let { r, cr } = PrepRange(srcE, ar, vDoc.name);
                                if (cr) {
                                    let doc = ar.parN.ownerDocument, docEnv = env, wins = r.wins = new Set();
                                    r.val = {
                                        async render(w, cr, args) {
                                            let svEnv = env, d = w.document;
                                            env = docEnv;
                                            SetLVars(vParams, args);
                                            vWin(w);
                                            try {
                                                if (cr) {
                                                    if (!bEncaps)
                                                        copySSheets(doc, d);
                                                    for (let S of RC.head.childNodes)
                                                        d.head.append(S.cloneNode(T));
                                                }
                                                let ar = { parN: d.body, r: w.r };
                                                await docBldr(ar);
                                            }
                                            finally {
                                                env = svEnv;
                                            }
                                        },
                                        open(target, features, ...args) {
                                            let w = W.open('', target || '', features), cr = !childWins.has(w);
                                            if (cr) {
                                                w.addEventListener('keydown', function (event) { if (event.key == 'Escape')
                                                    this.close(); });
                                                w.addEventListener('close', () => childWins.delete(w), wins.delete(w));
                                                childWins.add(w);
                                                wins.add(w);
                                            }
                                            else
                                                w.document.body.innerHTML = '';
                                            this.render(w, cr, args);
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
                                vDoc(r.val);
                            };
                            iB = 1;
                        }
                        break;
                    case 'RHEAD':
                        let { ws } = this;
                        this.ws = this.rspc = 1;
                        b = await this.CChilds(srcE);
                        this.ws = ws;
                        bl = b && async function HEAD(ar) {
                            let { sub } = PrepRange(srcE, ar);
                            sub.parN = ar.parN.ownerDocument.head;
                            sub.bfor = N;
                            await b(sub);
                            if (sub.prevR)
                                sub.prevR.parN = sub.parN;
                        };
                        iB = 1;
                        break;
                    case 'RSTYLE':
                        let save = [this.Settings.bDollarRequired, this.rIS, this.ws];
                        try {
                            this.Settings.bDollarRequired = T;
                            this.rIS = N;
                            this.ws = 4;
                            b = await this.CChilds(srcE);
                            bl = b && function RSTYLE(ar) {
                                return b(PrepElm(srcE, ar, 'STYLE').chAr);
                            };
                        }
                        finally {
                            [this.Settings.bDollarRequired, this.rIS, this.ws] = save;
                        }
                        iB = 1;
                        break;
                    case 'ELEMENT':
                        bl = await this.CHTMLElm(srcE, atts, this.CParam(atts, 'tagname', T));
                        this.ws = 3;
                        break;
                    case 'ATTRIBUTE':
                        NoChildren(srcE);
                        let dNm = this.CParam(atts, 'name', T), dVal = this.CParam(atts, 'value', T);
                        bl = async function ATTRIB(ar) {
                            let nm = dNm(), { r } = PrepRange(srcE, ar);
                            if (r.val && nm != r.val)
                                ar.parN.removeAttribute(r.val);
                            if (r.val = nm)
                                ar.parN.setAttribute(nm, dVal());
                        };
                        iB = 1;
                        break;
                    default:
                        bl = await this.CHTMLElm(srcE, atts);
                }
                atts.NoneLeft();
            }
            nm = (bl || (bl = dumB)).name;
            if (dOnerr || dOnsuc) {
                let b = bl;
                bl = async function SetOnError(ar) {
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
            if (befor.length + after.length) {
                if (iB > 1)
                    iB = 1;
                for (let g of conc(befor, after))
                    g.hndlr = this.CHandlr(g.att, g.txt);
                let b = bl;
                bl = async function ON(ar, x) {
                    let r = ar.r, bfD;
                    for (let g of befor) {
                        if (g.D && !r)
                            bfD = g.hndlr();
                        if (r ? g.U : g.C)
                            g.hndlr().call(r?.node || ar.parN);
                    }
                    await b(ar, x, T);
                    if (bfD)
                        ar.prevR.bfDest = bfD;
                    for (let g of after) {
                        if (g.D && !r)
                            ar.prevR.onDest = g.hndlr();
                        if (r ? g.U : g.C)
                            g.hndlr().call((r ? r.node : ar.prevR?.node) || ar.parN);
                    }
                };
            }
            if (dIf) {
                let b = bl;
                bl = function hIf(ar) {
                    let c = dIf(), { sub } = PrepRange(srcE, ar, '#if', 1, !c);
                    if (c)
                        return b(sub);
                };
            }
            for (let { att, dRV } of reacts.reverse()) {
                let b = bl, bR = /^t/.test(att);
                bl = att == 'hash'
                    ? async function HASH(ar) {
                        let { sub, r, cr } = PrepRange(srcE, ar, 'hash'), hashes = dRV();
                        if (cr || hashes.some((hash, i) => hash !== r.val[i])) {
                            r.val = hashes;
                            await b(sub);
                        }
                    }
                    : async function REACT(ar) {
                        let { r, sub } = PrepRange(srcE, ar, att);
                        await b(sub);
                        let subs = r.subs || (r.subs = Subscriber(ass(sub, { bR }), b, r.child)), pVars = r.rvars, i = 0;
                        if (!subs)
                            return;
                        r.val = sub.prevR?.val;
                        for (let rvar of r.rvars = dRV()) {
                            if (pVars) {
                                let p = pVars[i++];
                                if (rvar == p)
                                    continue;
                                p._Subs.delete(subs);
                            }
                            try {
                                rvar.Subscribe(subs);
                            }
                            catch {
                                ErrAtt('This is not an RVAR', att);
                            }
                        }
                    };
            }
            return bl == dumB ? N : ass(this.rActs.length == CTL
                ? this.ErrH(bl, srcE)
                : function Elm(ar) {
                    return bl(ar).catch(e => { throw ErrMsg(srcE, e, 39); });
                }, { iB, auto, nm });
        }
        catch (e) {
            throw ErrMsg(srcE, e);
        }
    }
    ErrH(bl, srcN) {
        return bl && (async (ar) => {
            let r = ar.r;
            if (r?.errN) {
                ar.parN.removeChild(r.errN);
                r.errN = U;
            }
            try {
                await bl(ar);
            }
            catch (e) {
                let msg = srcN instanceof HTMLElement ? ErrMsg(srcN, e, 39) : e;
                if (this.Settings.bAbortOnError)
                    throw msg;
                console.log(msg);
                if (onerr?.bBldr)
                    onerr(e);
                else if (this.Settings.bShowErrors) {
                    let errN = ar.parN.insertBefore(createErrNode(msg), ar.r?.FirstOrNext);
                    if (r)
                        r.errN = errN;
                }
            }
        });
    }
    async CScript(_srcParent, srcE, atts) {
        let { type, text, defer, async } = srcE, src = atts.g('src'), defs = atts.g('defines'), varlist = [...split(defs)], bMod = /^module$|;\s*type\s*=\s*("?)module\1\s*$/i.test(type), bCls = /^((text|application)\/javascript)?$/i.test(type), mOto = /^otoreact(\/((local)|static))?\b/.exec(type), bUpd = atts.gB('updating'), { ct } = this.CT, lvars = mOto && mOto[2] && this.LVars(defs), exp, SetVars = lvars
            ? (e) => SetLVars(lvars, e)
            : (e) => varlist.forEach((nm, i) => G[nm] = e[i]);
        atts.clear();
        if (mOto || (bCls || bMod) && this.Settings.bSubfile) {
            if (mOto && mOto[3]) {
                let prom = (async () => gEval(`'use strict';([${ct}])=>{${src ? await this.FetchText(src) : text}\n;return[${defs}]}`))();
                return async function LSCRIPT(ar) {
                    if (!ar.r || bUpd)
                        SetVars((await prom)(env));
                };
            }
            else if (bMod) {
                let prom = src
                    ? import(this.GetURL(src))
                    : import(src = URL.createObjectURL(new Blob([text.replace(/(\bimport\s(?:(?:\{.*?\}|\s|[a-zA-Z0-9_,*])*\sfrom)?\s*['"])([^'"]*)(['"])/g, (_, p1, p2, p3) => p1 + this.GetURL(p2) + p3)], { type: 'text/javascript' }))).finally(() => URL.revokeObjectURL(src));
                return async function MSCRIPT() {
                    let obj;
                    SetVars(exp || (exp = (obj = await prom,
                        varlist.map(nm => {
                            if (!(nm in obj))
                                throw `'${nm}' is not exported by this script`;
                            return obj[nm];
                        }))));
                };
            }
            else {
                let prom = (async () => `${mOto ? "'use strict';" : ""}${src ? await this.FetchText(src) : text}\n;[${defs}]`)();
                if (src && async)
                    prom = prom.then(txt => void (exp = gEval(txt)));
                else if (!mOto && !defer)
                    exp = gEval(await prom);
                return async function SCRIPT() {
                    SetVars(exp || (exp = gEval(await prom)));
                };
            }
        }
    }
    async CCase(srcE, atts) {
        let bHiding = atts.gB('hiding'), dVal = this.CAttExp(atts, 'value'), caseNodes = [], body = [];
        for (let node of srcE.childNodes) {
            if (node instanceof HTMLElement)
                switch (node.tagName) {
                    case 'THEN':
                        var bThen = T;
                        new Atts(node).NoneLeft();
                        caseNodes.push({ node, atts });
                        continue;
                    case 'ELSE':
                    case 'WHEN':
                        caseNodes.push({ node, atts: new Atts(node) });
                        continue;
                }
            body.push(node);
        }
        if (!bThen)
            if (srcE.tagName == 'IF')
                caseNodes.unshift({ node: srcE, atts, body });
            else
                atts.NoneLeft();
        let caseList = [], { ws, rspc, CT } = this, postCT = CT, postWs = 0, bEls;
        for (let { node, atts, body } of caseNodes) {
            ass(this, { ws, rspc, CT: new Context(CT) });
            let ES = this.SScope();
            try {
                let cond, not, patt, p;
                switch (node.tagName) {
                    case 'IF':
                    case 'THEN':
                    case 'WHEN':
                        cond = this.CAttExp(atts, 'cond');
                        not = atts.gB('not');
                        patt =
                            (p = atts.g('match')) != N
                                ? this.CPatt(p)
                                : (p = atts.g('urlmatch')) != N
                                    ? this.CPatt(p, T)
                                    : (p = atts.g('regmatch')) != N
                                        ? { regex: new RegExp(p, 'i'),
                                            lvars: this.LVars(atts.g('captures'))
                                        }
                                        : N;
                        if (bHiding && patt?.lvars.length)
                            throw `Pattern capturing cannot be combined with hiding`;
                        if (patt && !dVal)
                            throw `Match requested but no 'value' specified.`;
                    case 'ELSE':
                        let b = await this.CChilds(node, body || node.childNodes);
                        if (b) {
                            caseList.push({
                                cond, not, patt,
                                b: this.ErrH(b, node),
                                node
                            });
                            atts.NoneLeft();
                            postWs = Math.max(postWs, this.ws);
                            postCT = postCT.max(this.CT);
                            if (cond !== U)
                                bEls = T;
                        }
                }
            }
            catch (e) {
                throw node.tagName == 'IF' ? e : ErrMsg(node, e);
            }
            finally {
                ES();
            }
        }
        this.ws = !bEls && ws > postWs ? ws : postWs;
        this.CT = postCT;
        return async function CASE(ar) {
            let val = dVal?.(), RRE;
            try {
                for (var alt of caseList)
                    if (!((!alt.cond || alt.cond())
                        && (!alt.patt || val != N && (RRE = alt.patt.regex.exec(val)))) != !alt.not) {
                        var cAlt = alt;
                        break;
                    }
            }
            catch (e) {
                throw alt.node.tagName == 'IF' ? e : ErrMsg(alt.node, e);
            }
            finally {
                if (bHiding) {
                    for (let alt of caseList) {
                        let { r, chAr, cr } = PrepElm(alt.node, ar);
                        if (!(r.node.hidden = alt != cAlt) && !ar.bR
                            || cr)
                            await alt.b(chAr);
                    }
                }
                else {
                    let { sub, cr } = PrepRange(srcE, ar, '', 1, cAlt);
                    if (cAlt && (cr || !ar.bR)) {
                        if (RRE)
                            RRE.shift(),
                                SetLVars(cAlt.patt.lvars, cAlt.patt.url ? RRE.map(decodeURIComponent) : RRE);
                        await cAlt.b(sub);
                    }
                }
            }
        };
    }
    async CFor(srcE, atts) {
        let letNm = atts.g('let') ?? atts.g('var'), ixNm = atts.g('index', U, U, T);
        this.rspc = F;
        if (letNm != N) {
            let dOf = this.CAttExp(atts, 'of', T), pvNm = atts.g('previous', U, U, T), nxNm = atts.g('next', U, U, T), dUpd = this.CAttExp(atts, 'updates'), bReact = atts.gB('reacting') || atts.gB('reactive') || dUpd;
            return await this.Framed(async (SScope) => {
                let vLet = this.LVar(letNm), vIx = this.LVar(ixNm), vPv = this.LVar(pvNm), vNx = this.LVar(nxNm), dKey = this.CAttExp(atts, 'key'), dHash = this.CAttExpList(atts, 'hash'), bl = await this.CChilds(srcE);
                return bl && async function FOR(ar) {
                    let { r, sub } = PrepRange(srcE, ar, ''), { parN } = sub, bfor = sub.bfor !== U ? sub.bfor : r.Next, iter = dOf() || E, pIter = async (iter) => {
                        if (!(Symbol.iterator in iter || Symbol.asyncIterator in iter))
                            throw `[of] Value (${iter}) is not iterable`;
                        let keyMap = r.val || (r.val = new Map()), nwMap = new Map(), ix = 0, { ES } = SScope(N, {});
                        try {
                            for await (let item of iter) {
                                vLet(item);
                                vIx(ix);
                                let hash = dHash?.(), key = dKey?.() ?? hash?.[0];
                                if (key != N && nwMap.has(key))
                                    throw `Duplicate key '${key}'`;
                                nwMap.set(key ?? {}, { item, hash, ix: ix++ });
                            }
                        }
                        finally {
                            ES();
                        }
                        let nxChR = r.child, iterator = nwMap.entries(), nxIter = nxNm && nwMap.values(), prItem, nxItem, prevR, chAr;
                        sub.parR = r;
                        nxIter?.next();
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
                            let [key, { item, hash, ix }] = nx.value, chR = keyMap.get(key), cr = !chR;
                            if (nxIter)
                                nxItem = nxIter.next().value?.item;
                            if (cr) {
                                sub.r = N;
                                sub.prevR = prevR;
                                sub.bfor = nxChR?.FirstOrNext || bfor;
                                ({ r: chR, sub: chAr } = PrepRange(N, sub, `${letNm}(${ix})`));
                                if (key != N)
                                    keyMap.set(key, chR);
                                chR.key = key;
                            }
                            else {
                                if (chR.fragm) {
                                    parN.insertBefore(chR.fragm, nxChR?.FirstOrNext || bfor);
                                    chR.fragm = N;
                                }
                                else
                                    while (T) {
                                        if (nxChR == chR)
                                            nxChR = nxChR.next;
                                        else {
                                            if (nwMap.get(nxChR.key)?.ix > ix + 3) {
                                                (nxChR.fragm = D.createDocumentFragment()).append(...nxChR.Nodes());
                                                nxChR = nxChR.next;
                                                continue;
                                            }
                                            chR.prev.next = chR.next;
                                            if (chR.next)
                                                chR.next.prev = chR.prev;
                                            let nxNode = nxChR?.FirstOrNext || bfor;
                                            for (let node of chR.Nodes())
                                                parN.insertBefore(node, nxNode);
                                        }
                                        break;
                                    }
                                chR.next = nxChR;
                                chR.text = `${letNm}(${ix})`;
                                if (prevR)
                                    prevR.next = chR;
                                else
                                    r.child = chR;
                                sub.r = chR;
                                chAr = PrepRange(N, sub, '').sub;
                                sub.parR = N;
                            }
                            chR.prev = prevR;
                            prevR = chR;
                            if (cr || !hash
                                || hash.some((h, i) => h != chR.hash[i])) {
                                chR.hash = hash;
                                let { sub, ES } = SScope(chAr, chR);
                                try {
                                    if (bReact && (cr || item != chR.rvars[0])) {
                                        RVAR_Light(item, dUpd && [dUpd()]);
                                        if (chR.subs)
                                            item._Subs = chR.rvars[0]._Subs;
                                        chR.rvars = [item];
                                    }
                                    vLet(item);
                                    vIx(ix);
                                    vPv(prItem);
                                    vNx(nxItem);
                                    await bl(sub);
                                    if (bReact && !chR.subs)
                                        item.Subscribe(chR.subs = Subscriber(sub, bl, chR.child));
                                }
                                finally {
                                    ES();
                                }
                            }
                            prItem = item;
                        }
                        if (prevR)
                            prevR.next = N;
                        else
                            r.child = N;
                    };
                    if (iter instanceof Promise) {
                        let subEnv = { env, onerr, onsuc };
                        r.rvars = [RVAR(N, iter, N, r.subs =
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
                        await pIter(iter);
                };
            });
        }
        else {
            let nm = atts.g('of', T, T).toUpperCase(), { CT } = this, d = CT.d, CSK = CT.csMap.get(nm);
            if (!CSK)
                throw `Missing attribute [let]`;
            let ck = CSK[1], vIdx = this.LVar(ixNm), DC = this.LCons([CSK[0]]), bl = await this.CChilds(srcE);
            return bl && async function FOREACH_Slot(ar) {
                let { sub } = PrepRange(srcE, ar), slotDef = getV(ck, d), idx = 0;
                for (let slotBldr of slotDef.tmplts) {
                    vIdx(idx++);
                    DC([
                        { nm, tmplts: [slotBldr], CEnv: slotDef.CEnv }
                    ]);
                    await bl(sub);
                }
            };
        }
    }
    ParseSign(elmSignat) {
        let sig = new Signature(elmSignat);
        for (let attr of elmSignat.attributes) {
            if (sig.RP)
                throw `Rest parameter must be last`;
            let m = /^(#|@|\.\.\.|_|)(.*?)(\?)?$/.exec(attr.name);
            if (m[1] != '_') {
                let param = {
                    mode: m[1],
                    nm: m[2],
                    pDflt: m[1] == '...' ? () => E
                        : attr.value != ''
                            ? (m[1] == '#' ? this.CJScript(attr.value, attr.name) : this.CString(attr.value, attr.name))
                            : m[3] ? /^on/.test(m[2]) ? () => _ => N : dU
                                : N
                };
                sig.Params.push(param);
                if (m[1] == '...')
                    sig.RP = param;
            }
        }
        for (let elmSlot of elmSignat.children) {
            let s = this.ParseSign(elmSlot);
            s.bCln = s.Slots.size;
            mapNm(sig.Slots, s);
            if (/^CONTENT/.test(s.nm)) {
                if (sig.CSlot)
                    throw 'Multiple content slots';
                sig.CSlot = s;
            }
        }
        return sig;
    }
    async CComponent(srcE, atts) {
        let bRec = atts.gB('recursive'), { head, ws } = this, signats = [], CDefs = [], encStyles = atts.gB('encapsulate')
            && (this.head = srcE.ownerDocument.createDocumentFragment()).children, arr = Array.from(srcE.children), elmSign = arr.shift(), elmTempl = arr.pop(), t = /^TEMPLATE(S)?$/.exec(elmTempl?.tagName);
        if (!elmSign)
            throw 'Missing signature(s)';
        if (!t)
            throw 'Missing template(s)';
        for (let elm of /^SIGNATURES?$/.test(elmSign.tagName) ? elmSign.children : [elmSign])
            signats.push(this.ParseSign(elm));
        try {
            var DC = bRec && this.LCons(signats), ES = this.SScope(), bl = this.ErrH(await this.CIter(srcE, arr), srcE);
            let mapS = new Map(mapI(signats, S => [S.nm, S]));
            async function AddTemp(RC, nm, prnt, elm) {
                let S = mapS.get(nm);
                if (!S)
                    throw `<${nm}> has no signature`;
                CDefs.push({
                    nm,
                    tmplts: [await RC.CTempl(S, prnt, elm, F, encStyles)]
                });
                mapS.delete(nm);
            }
            if (t[1])
                for (let elm of elmTempl.children)
                    await AddTemp(this, elm.tagName, elm, elm);
            else
                await AddTemp(this, signats[0].nm, elmTempl.content, elmTempl);
            for (let nm of mapS.keys())
                throw `Signature <${nm}> has no template`;
        }
        finally {
            ES();
            ass(this.head, { head, ws });
        }
        DC || (DC = this.LCons(signats));
        return async function COMP(ar) {
            let constr = CDefs.map(C => ({ ...C }));
            if (bRec)
                DC(constr);
            await bl?.(ar);
            for (let c of constr)
                c.CEnv = env;
            if (!bRec)
                DC(constr);
        };
    }
    async CTempl(signat, contentNode, srcE, bIsSlot, styles, atts) {
        return this.Framed(async (SScope) => {
            try {
                let myAtts = atts || new Atts(srcE), lvars = signat.Params.map(({ mode, nm }) => [nm, this.LVar((myAtts.g(mode + nm) ?? myAtts.g(nm, bIsSlot)) || nm)]), DC = this.LCons(signat.Slots.values());
                if (!atts)
                    myAtts.NoneLeft();
                this.ws = this.rspc = 1;
                let bl = await this.CChilds(contentNode), Cnm = signat.nm, custNm = /^[A-Z].*-/.test(Cnm) ? Cnm : `rhtml-${Cnm}`;
                return bl && async function TEMPL(args, mSlots, CEnv, ar) {
                    let { sub, ES } = SScope(ar);
                    try {
                        lvars.forEach(([nm, lv], i) => {
                            let arg = args[nm];
                            lv(arg !== U ? arg : signat.Params[i]?.pDflt?.());
                        });
                        DC(mapI(signat.Slots.keys(), nm => ({ nm, tmplts: mSlots.get(nm) || E, CEnv, Cnm })));
                        if (styles) {
                            let { r: { node }, chAr, cr } = PrepElm(srcE, sub, custNm), shadow = node.shadowRoot || node.attachShadow({ mode: 'open' });
                            if (cr)
                                for (let style of styles)
                                    shadow.appendChild(style.cloneNode(T));
                            if (signat.RP)
                                ApplyMod(node, { mt: 8, nm: N, depV: N }, args[signat.RP.nm], cr);
                            chAr.parN = shadow;
                            sub = chAr;
                        }
                        await bl(sub);
                    }
                    finally {
                        ES();
                    }
                };
            }
            catch (e) {
                throw ErrMsg(srcE, 'template: ' + e);
            }
        });
    }
    async CInstance(srcE, atts, [signat, ck]) {
        if (signat.prom)
            await signat.prom;
        let d = this.CT.d, { RP, CSlot } = signat, getArgs = [], SBldrs = new Map();
        for (let [nm] of signat.Slots)
            SBldrs.set(nm, []);
        for (let { mode, nm, pDflt } of signat.Params)
            if (mode == '@') {
                let attVal = atts.g(mode + nm, !pDflt);
                getArgs.push(attVal
                    ? [nm, this.CJScript(attVal, mode + nm), this.CTarget(attVal, nm)]
                    : [nm, U, dU]);
            }
            else if (mode != '...') {
                let dH = this.CParam(atts, nm, !pDflt);
                if (dH)
                    getArgs.push([nm, dH]);
            }
        let slotE, slot, nm;
        for (let node of Array.from(srcE.children))
            if ((slot = signat.Slots.get(nm = (slotE = node).tagName))
                && slot != CSlot) {
                SBldrs.get(nm).push(await this.CTempl(slot, slotE, slotE, T));
                srcE.removeChild(node);
            }
        if (CSlot)
            SBldrs.get(CSlot.nm).push(await this.CTempl(CSlot, srcE, srcE, T, N, atts));
        if (RP) {
            let mods = this.CAtts(atts);
            getArgs.push([
                RP.nm,
                () => mods.map(M => ({ M, v: M.depV() }))
            ]);
        }
        atts.NoneLeft();
        this.ws = 3;
        return async function INST(ar) {
            let { r, sub, cr } = PrepRange(srcE, ar), IEnv = env, cdef = getV(ck, d), args = r.res || (r.res = {});
            if (!cdef)
                return;
            ro = T;
            for (let [nm, dGet, dSet] of getArgs)
                if (!dSet)
                    args[nm] = dGet();
                else if (cr)
                    args[nm] = RVAR('', dGet?.(), N, dSet());
                else if (dGet)
                    args[nm].V = dGet();
            ro = F;
            try {
                env = cdef.CEnv;
                for (let templ of cdef.tmplts)
                    await templ?.(args, SBldrs, IEnv, sub);
            }
            finally {
                env = IEnv;
            }
        };
    }
    async CHTMLElm(srcE, atts, dTag) {
        let nm = dTag ? N : srcE.tagName.replace(/\.+$/, ''), preWs = this.ws, postWs;
        if (this.setPRE.has(nm) || /^.re/.test(srcE.style.whiteSpace)) {
            this.ws = 4;
            postWs = 1;
        }
        else if (reBlock.test(nm))
            this.ws = this.rspc = postWs = 1;
        else if (reInline.test(nm)) {
            this.ws = this.rspc = 1;
            postWs = 3;
        }
        if (preWs == 4)
            postWs = preWs;
        let mods = this.CAtts(atts), childBldr = await this.CChilds(srcE);
        if (postWs)
            this.ws = postWs;
        return aIb(async function ELM(ar) {
            let { r: { node }, chAr, cr } = PrepElm(srcE, ar, nm || dTag());
            if (cr || !ar.bR)
                await childBldr?.(chAr);
            node.removeAttribute('class');
            if (node.hndlrs) {
                for (let { evType, listener } of node.hndlrs)
                    node.removeEventListener(evType, listener);
                node.hndlrs = [];
            }
            ApplyMods(node, mods, cr);
        }, postWs == 1 || preWs < 4 && childBldr?.iB);
    }
    CAtts(atts) {
        let mods = [], m;
        function addM(mt, nm, depV) {
            mods.push({ mt, nm, depV });
        }
        for (let [nm, V] of atts)
            if (m = /(.*?)\.+$/.exec(nm))
                addM(0, nm, this.CString(V, nm));
            else if (m = /^on(.*?)\.*$/i.exec(nm))
                addM(5, m[0], this.AddErrH(this.CHandlr(nm, V)));
            else if (m = /^#class[:.](.*)$/.exec(nm))
                addM(3, m[1], this.CJScript(V, nm));
            else if (m = /^(#)?style\.(.*)$/.exec(nm))
                addM(4, CapProp(m[2]), m[1] ? this.CJScript(V, nm) : this.CString(V, nm));
            else if (nm == '+style')
                addM(6, nm, this.CJScript(V, nm));
            else if (nm == "+class")
                addM(7, nm, this.CJScript(V, nm));
            else if (m = /^([\*\+#!]+|@@?)(.*?)\.*$/.exec(nm)) {
                let nm = altProps[m[2]] || m[2], dSet;
                if (/[@#]/.test(m[1])) {
                    let depV = this.CJScript(V, nm);
                    if (/^on/.test(nm))
                        addM(5, nm, this.AddErrH(depV));
                    else
                        addM(1, nm, depV);
                }
                if (m[1] != '#') {
                    let dS = this.CTarget(V), cnm;
                    dSet = () => {
                        let S = dS();
                        return function () {
                            S(this[cnm || (cnm = ChkNm(this, nm))]);
                        };
                    };
                }
                if (/\*/.test(m[1]))
                    addM(9, nm, dSet);
                if (/\+/.test(m[1]))
                    addM(10, nm, dSet);
                if (/[@!]/.test(m[1]))
                    addM(5, /!!|@@/.test(m[1]) ? 'onchange' : 'oninput', dSet);
            }
            else if (m = /^\.\.\.(.*)/.exec(nm)) {
                if (V)
                    throw 'A rest parameter cannot have a value';
                addM(8, nm, this.CName(m[1]));
            }
            else if (nm == 'src')
                addM(2, this.FilePath, this.CString(V, nm));
            else
                addM(0, nm, this.CString(V, nm));
        atts.clear();
        return mods;
    }
    CString(data, nm) {
        let rIS = this.rIS || (this.rIS = new RegExp(/(\\[${])|/.source
            + (this.Settings.bDollarRequired ? /\$/ : /\$?/).source
            + /\{((\{(\{.*?\}|.)*?\}|'(\\'|.)*?'|"(\\"|.)*?"|`(\\`|.)*?`|\\\}|.)*?)\}|$/.source, 'gs')), gens = [], ws = nm || this.Settings.bKeepWhiteSpace ? 4 : this.ws, isTriv = T, lastIx = rIS.lastIndex = 0, m;
        while (T)
            if (!(m = rIS.exec(data))[1]) {
                var fixed = lastIx < m.index ? data.slice(lastIx, m.index) : N;
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
                if (lastIx == data.length)
                    break;
                if (m[2])
                    isTriv =
                        !gens.push(this.CJScript(m[2], nm, '{}'));
                lastIx = rIS.lastIndex;
            }
        if (isTriv) {
            fixed = gens.join('');
            return ass(() => fixed, { fixed });
        }
        else
            return () => {
                let s = "";
                for (let g of gens)
                    s += typeof g == 'string' ? g : g() ?? '';
                return s;
            };
    }
    CPatt(patt, url) {
        let reg = '', lvars = [], regIS = /\\[{}]|\{((?:[^}]|\\\})*)\}|\?|\*|(\\.)|\[\^?(?:\\.|[^\\\]])*\]|$/gs;
        while (regIS.lastIndex < patt.length) {
            let ix = regIS.lastIndex, m = regIS.exec(patt), lits = patt.slice(ix, m.index);
            if (lits)
                reg += quoteReg(lits);
            reg +=
                m[1]
                    ? (lvars.push(this.LVar(m[1])), `(.*?)`)
                    : m[0] == '?' ? '.'
                        : m[0] == '*' ? '.*'
                            : m[2] ? m[2]
                                : m[0];
        }
        return { lvars, regex: new RegExp(`^${reg}$`, 'i'), url };
    }
    CParam(atts, attNm, bReq) {
        let v = atts.g(attNm);
        return (v == N ? this.CAttExp(atts, attNm, bReq)
            : /^on/.test(attNm) ? this.CHandlr(attNm, v)
                : this.CString(v, attNm));
    }
    CAttExp(atts, att, bReq, check) {
        return this.CJScript(atts.g(att, bReq, T), att, U, check);
    }
    CTarget(expr, nm) {
        try {
            return this.CJScript(`$=>(${expr})=$`, nm);
        }
        catch (e) {
            throw 'Invalid assignment target: ' + e;
        }
    }
    CHandlr(nm, text) {
        return /^#/.test(nm) ? this.CJScript(text, nm)
            : this.CJScript(`function(event){${text}\n}`, nm);
    }
    CJScript(expr, descrip, dlms = '""', check) {
        if (expr == N)
            return N;
        try {
            var E = '\nat ' + (descrip ? `[${descrip}]=` : '') + dlms[0] + Abbr(expr) + dlms[1], rout = gEval(`'use strict';(function expr([${this.CT.ct}]){return(${expr}\n)})`);
            return function () {
                try {
                    let t = rout.call(this, env), m = check?.(t);
                    if (m)
                        throw m;
                    return t;
                }
                catch (e) {
                    throw e + E;
                }
            };
        }
        catch (e) {
            throw e + E;
        }
    }
    CName(nm) {
        let k = this.CT.varM.get(nm), d = this.CT.d;
        if (!k)
            throw `Unknown name '${nm}'`;
        return () => getV(k, d);
    }
    CAttExpList(atts, attNm, bReacts) {
        let list = atts.g(attNm, F, T);
        if (list == N)
            return N;
        if (bReacts)
            for (let nm of split(list))
                this.cRvars[nm] = N;
        return this.CJScript(`[${list}\n]`, attNm);
    }
    AddErrH(dHndlr) {
        return () => {
            let hndlr = dHndlr(), oE = onerr, oS = onsuc;
            return (hndlr && (oE || oS)
                ? function hError(ev) {
                    try {
                        let a = hndlr.call(this, ev);
                        if (a instanceof Promise)
                            return a.then(oS && (v => (oS(ev), v)), oE);
                        oS?.(ev);
                        return a;
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
    FetchText(src) {
        return RFetch(this.GetURL(src)).then(r => r.text());
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
    let rp = await fetch(input, init);
    if (!rp.ok)
        throw `${init?.method || 'GET'} ${input} returned ${rp.status} ${rp.statusText}`;
    return rp;
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
    g(nm, bReq, bHash, bI) {
        let m = nm, v = super.get(m);
        if (v == N && bHash)
            v = super.get(m = '#' + nm);
        if (v != N)
            super.delete(m);
        else if (bReq)
            throw `Missing attribute [${nm}]`;
        return bI && v == '' ? nm : v;
    }
    gB(nm) {
        let v = this.g(nm), m = /^((false)|true)?$/i.exec(v);
        if (v != N) {
            if (!m)
                throw `@${nm}: invalid value`;
            return !m[2];
        }
    }
    NoneLeft() {
        super.delete('hidden');
        if (super.size)
            throw `Unknown attribute(s): ${Array.from(super.keys()).join(',')}`;
    }
}
let R = new RCompiler(), altProps = {
    "class": "className",
    for: "htmlFor"
}, reReserv = /^(break|case|catch|class|continue|debugger|default|delete|do|else|export|extends|finally|for|function|if|import|in|instanceof|new|return|super|switch|this|throw|try|typeof|var|void|while|with|enum|implements|interface|let|package|private|protected|public|static|yield|null|true|false)$/, reCap = /(accent|additive|align|angle|animation|ascent|aspect|auto|back(drop|face|ground)|backface|behavior|blend|block|border|bottom|box|break|caption|caret|character|clip|color|column(s$)?|combine|conic|content|counter|css|decoration|display|emphasis|empty|end|feature|fill|filter|flex|font|forced|frequency|gap|grid|hanging|hue|hyphenate|image|initial|inline|inset|iteration|justify|language|left|letter|line(ar)?|list|margin|mask|masonry|math|max|min|nav|object|optical|outline|overflow|padding|page|paint|perspective|place|play|pointer|rotate|position|print|radial|read|repeating|right|row(s$)?|ruby|rule|scale|scroll(bar)?|shape|size|snap|skew|skip|speak|start|style|tab(le)?|template|text|timing|top|touch|transform|transition|translate|underline|unicode|user|variant|variation|vertical|viewport|white|will|word|writing|^z)|./g, reBlock = /^(BODY|BLOCKQUOTE|D[DLT]|DIV|FORM|H\d|HR|LI|OL|P|TABLE|T[RHD]|UL|SELECT|TITLE)$/, reInline = /^(BUTTON|INPUT|IMG)$/, reWS = /^[ \t\n\r]*$/, Cnms = {};
function CapProp(nm) {
    let b;
    return nm.replace(reCap, (w, w1) => {
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
function ErrMsg(elm, e, maxL) {
    return e + '\nat ' + Abbr(/<.*?(?=>)/s.exec(elm.outerHTML)[0], maxL) + '>';
}
function ErrAtt(e, nm) {
    throw nm ? e + '\nat [' + nm + ']' : e;
}
function Abbr(s, m = 60) {
    return s.length > m ?
        s.slice(0, m - 3) + "..."
        : s;
}
function LAbbr(s, m = 1000) {
    return s.length > m ?
        "... " + s.slice(s.length - m + 4)
        : s;
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
function* mapI(I, f) {
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
function createErrNode(msg) {
    let e = D.createElement('div');
    ass(e.style, { color: 'crimson', fontFamily: 'sans-serif', fontSize: '10pt' });
    e.innerText = msg;
    return e;
}
function NoChildren(srcE) {
    for (let node of srcE.childNodes)
        if (srcE.childElementCount
            || node.nodeType == Node.TEXT_NODE && !reWS.test(node.nodeValue))
            throw `<${srcE.tagName} ...> must be followed by </${srcE.tagName}>`;
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
        W.addEventListener('popstate', _ => this.V = L.href);
        let DL = this;
        this.query = new Proxy({}, {
            get(_, key) { return DL.url.searchParams.get(key); },
            set(_, key, val) { DL.V = DL.search(key, val); return true; }
        });
        this.Subscribe(loc => {
            let h = (this.url = new URL(loc)).href;
            h == L.href || history.pushState(N, N, h);
            ScrollToHash();
        }, T, T);
    }
    get subpath() { return L.pathname.slice(this.basepath.length); }
    set subpath(s) {
        this.url.pathname = this.basepath + s;
        this.V = this.url.href;
    }
    search(fld, val) {
        let U = new URL(this.v);
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
