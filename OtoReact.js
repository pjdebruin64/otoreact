const N = null, T = !0, F = !T, U = void 0, Q = '', E = [], G = self, W = window, D = document, L = location, US = "'use strict';", ass = Object.assign, K = x => () => x, B = (f, g) => x => f(g(x)), P = new DOMParser, now = () => performance.now(), thro = (e) => { throw e; }, V = eval, TryV = (e, m, s = '\nin ') => {
    try {
        return V(e);
    }
    catch (x) {
        throw x + s + m;
    }
}, EL = (et, k, el) => et.addEventListener(k, el), dflts = {
    bShowErrors: T,
    bAutoPointer: T,
    preformatted: E,
    version: 1,
}, dr = (v) => v instanceof RV ? v.V : v;
class Context {
    constructor(CT, a) {
        ass(this, CT || {
            d: 0, L: 0, M: 0, ct: Q,
            lvM: new Map, csM: new Map
        });
        if (a && CT) {
            this.lvM = new Map(this.lvM);
            this.csM = new Map(this.csM);
        }
    }
    getV(k) {
        if (k) {
            let D = this.d;
            return (e = env) => {
                let { d, i } = k;
                while (d++ < D)
                    e = e[0];
                return e[i];
            };
        }
    }
    getLV(nm) {
        return this.getV(this.lvM.get(nm) || thro(`Unknown name '${nm}'`));
    }
    getCS(nm) {
        let SK = this.csM.get(nm);
        return SK && { S: SK.S, dC: this.getV(SK.k) };
    }
    max(CT) {
        return ass(CT.L > this.L ? CT : this, {
            M: Math.min(this.M, CT.M)
        });
    }
}
class Range {
    constructor(a, n, text) {
        this.text = text;
        this.n = n;
        if (a) {
            let { pR: p, prR: q } = a;
            if (p && !p.n)
                this.pR = p;
            if (q)
                q.nx = this;
            else if (p)
                p.ch = this;
            a.prR = this;
        }
    }
    toString() { return this.text || this.n?.nodeName; }
    get Fst() {
        if (this.pN == N) {
            let { n, ch } = this;
            while (!n && ch) {
                n = ch.Fst;
                ch = ch.nx;
            }
            return n;
        }
    }
    get Nxt() {
        let r = this, n, p;
        do {
            p = r.pR;
            while (r = r.nx)
                if (n = r.Fst)
                    return n;
        } while (r = p);
    }
    get FstOrNxt() {
        return this.Fst || this.Nxt;
    }
    Nodes() {
        return (function* Nodes(r) {
            let c;
            if (r.n)
                yield r.n;
            else if (c = r.ch)
                do {
                    yield* Nodes(c);
                } while (c = c.nx);
        })(this);
    }
    erase(par) {
        let { n, ch } = this;
        if (n && par) {
            par.removeChild(n);
            par = N;
        }
        this.ch = N;
        while (ch) {
            ch.bD?.call(ch.n || par);
            ch.rvars?.forEach(rv => rv.$subs.delete(ch));
            ch.erase(ch.pN ?? par);
            ch.aD?.call(ch.n || par);
            ch = ch.nx;
        }
    }
    async update() {
        let b, bR, pR;
        if (this.upd < upd)
            ({ env, oes, pN, b, bR, pR } = this.uInfo),
                await b({ r: this, pN, pR }, bR);
    }
}
const PrepRng = (a, srcE, text = Q, nWipe, res) => {
    let { pN, r } = a, sub = { pN }, cr;
    if (cr = !r) {
        sub.srcN = a.srcN;
        sub.bfor = a.bfor;
        r = sub.pR = new Range(a, N, srcE ? srcE.tagName + (text && ' ' + text) : text);
    }
    else {
        sub.r = r.ch || T;
        a.r = r.nx || T;
        if (cr = nWipe && (nWipe > 1 || res != r.res)) {
            (sub.pR = r).erase(pN);
            sub.r = N;
            sub.bfor = r.Nxt;
        }
    }
    r.res = res;
    return { r, sub, cr };
}, PrepElm = (a, tag) => {
    let r = a.r, cr = !r;
    if (cr)
        r = new Range(a, a.srcN
            || a.pN.insertBefore(D.createElement(tag), a.bfor));
    else
        a.r = r.nx || T;
    nodeCnt++;
    return {
        r,
        sub: {
            pN: pN = r.n,
            r: r.ch,
            bfor: N,
            pR: r
        },
        cr
    };
}, PrepData = (a, data, bC) => {
    let r = a.r;
    if (!r)
        r = new Range(a, pN.insertBefore(bC ? D.createComment(data) : D.createTextNode(data), a.bfor));
    else {
        r.n.data = data;
        a.r = r.nx || T;
    }
    nodeCnt++;
    return r;
};
class Signat {
    constructor(srcE, RC) {
        ass(this, { nm: srcE.tagName,
            srcE, RC,
            Pams: [],
            Slots: new Map
        });
        for (let attr of srcE.attributes) {
            let [a, m, rp, dum, nm, on, q] = /^(#|@|(\.\.\.)|(_)|)((on)?.*?)(\?)?$/.exec(attr.name), v = attr.value;
            if (!dum) {
                if (this.RP)
                    throw `Rest parameter must be last`;
                if (!nm && !rp)
                    throw 'Empty parameter name';
                let pDf = v ? m ? RC.CExpr(v, a) : RC.CText(v, a)
                    : on && K(dU);
                this.Pams.push({
                    mode: m,
                    nm,
                    rq: !(q || pDf || rp),
                    pDf: m == '@' ? () => RVAR(U, pDf?.()) : pDf
                });
                this.RP = rp && nm;
            }
        }
        let { ct } = RC.CT, s;
        RC.CT.ct = Q;
        try {
            for (let eSlot of srcE.children) {
                mapNm(this.Slots, s = new Signat(eSlot, RC));
                if (/^CONTENT/.test(s.nm)) {
                    if (this.CSlot)
                        throw 'Multiple content slots';
                    this.CSlot = s;
                }
            }
        }
        finally {
            RC.CT.ct = ct;
        }
    }
    IsCompat(sig) {
        if (sig) {
            let c = T, mP = new Map(mapI(sig.Pams, p => [p.nm, p])), p;
            for (let { nm, rq } of this.Pams)
                if (c && (c = p = mP.get(nm))) {
                    c && (c = rq || !p.rq);
                    mP.delete(nm);
                }
            for (let p of mP.values())
                c && (c = !p.rq);
            for (let [nm, slotSig] of this.Slots)
                c && (c = sig.Slots.get(nm)?.IsCompat(slotSig));
            return c;
        }
    }
}
export class RV {
    constructor(n, t) {
        this.$V = U;
        this.$C = 0;
        this.$imm = N;
        this.$subs = new Set;
        this.$name = n;
        if (t instanceof Promise)
            this.Set(t);
        else
            this.$V = t;
    }
    get V() {
        AR(this);
        return this.$V;
    }
    set V(v) {
        this.$C++;
        let p = this.$V;
        this.$V = v;
        v === p || this.SetDirty(p);
    }
    Subscribe(s, bImm, cr) {
        if (s) {
            if (cr)
                s(this.$V);
            (bImm ? this.$imm || (this.$imm = new Set) : this.$subs).add(s);
        }
        return this;
    }
    Unsubscribe(s) {
        this.$imm?.delete(s);
        this.$subs.delete(s);
    }
    $SR({ pR, pN }, b, r, bR = true) {
        r.uInfo || (r.uInfo = { b, env, oes, pN, pR, bR });
        this.$subs.add(r);
        (r.rvars || (r.rvars = new Set)).add(this);
    }
    $UR(r) {
        this.$subs.delete(r);
        r.rvars.delete(this);
    }
    get Set() {
        return t => {
            if (t instanceof Promise) {
                this.V = U;
                let c = this.$C;
                t.then(v => this.$C == c && (this.V = v), oes.e);
            }
            else
                this.V = t;
        };
    }
    get Clear() {
        return () => Jobs.has(this) || (this.V = U);
    }
    get U() {
        ro ? AR(this) : this.SetDirty();
        return this.$V;
    }
    set U(t) { this.$V = t; this.SetDirty(); }
    SetDirty(prev) {
        this.$imm?.forEach(s => s(this.$V, prev));
        this.$subs.size && AJ(this);
    }
    async Ex() {
        for (let subs of this.$subs)
            try {
                if (subs instanceof Range)
                    await subs.update();
                else
                    subs(this.$V);
            }
            catch (e) {
                console.log(e = 'ERROR: ' + Abbr(e, 1000));
                alert(e);
            }
    }
    valueOf() { return this.V?.valueOf(); }
    toString() { return this.V?.toString() ?? Q; }
}
const ProxH = {
    get(rv, p) {
        if (p in rv)
            return rv[p];
        let ob = rv.V, v = ob?.[p];
        return v instanceof Function ? v.bind(ob) : v;
    },
    set(rv, p, v) {
        if (p in rv)
            rv[p] = v;
        else if (v !== rv.$V[p])
            rv.U[p] = v;
        return T;
    },
    deleteProperty(rv, p) {
        return p in rv.$V ? delete rv.U[p] : T;
    },
    has(rv, p) {
        return p in rv || rv.V != N && p in rv.$V;
    }
};
export function RVAR(nm, val, store, imm, storeNm, updTo) {
    if (store) {
        var sNm = storeNm || 'RVAR_' + nm, s = store.getItem(sNm);
        if (s)
            try {
                val = JSON.parse(s);
            }
            catch { }
    }
    let rv = new RV(nm || storeNm, val).Subscribe(imm, T);
    store &&
        rv.Subscribe(v => store.setItem(sNm, JSON.stringify(v ?? N)));
    updTo &&
        rv.Subscribe(() => updTo.SetDirty(), T);
    rv = new Proxy(rv, ProxH);
    if (nm)
        G[nm] = rv;
    return rv;
}
let env, oes = { e: N, s: N }, pN, Jobs = new Set, hUpd, ro = F, upd = 0, nodeCnt = 0, start, arA, arR, arB, arVars;
const AR = (rv, bA) => arA &&
    (arVars || (arVars = new Map)).set(rv, bA || arVars?.get(rv)), arChk = () => {
    if (arA) {
        if (arR || arVars && (arR = arA.prR)) {
            arVars?.forEach((bA, rv) => arR.uv?.delete(rv) || rv.$SR(arA, arB, arR, !bA));
            arR.uv?.forEach((_, rv) => rv.$UR(arR));
            arR.uv = arVars;
            arR.upd = upd;
        }
        arA = arVars = N;
    }
}, chWins = new Set, OMods = new Map, NoTime = (prom) => {
    let t = now();
    return prom.finally(() => start += now() - t);
}, AJ = (job) => {
    Jobs.add(job);
    hUpd || (hUpd = setTimeout(DoUpdate, 1));
};
let evM = (M) => {
    let v = M.d();
    if (v instanceof RV) {
        if (M.T)
            M.T.d = K(v.Set);
        v = v.V;
    }
    return v;
};
class Hndlr {
    constructor() {
        this.oes = oes;
    }
    handleEvent(ev, ...r) {
        if (this.h)
            try {
                var { e, s } = this.oes, v = this.h.call(ev?.currentTarget, ev, ...r);
                v === false && ev.preventDefault();
                v instanceof Promise
                    ? v.then(_ => s?.(ev), e)
                    : s?.(ev);
            }
            catch (er) {
                (e || thro)(er);
            }
    }
}
class Targ {
    constructor(nm) {
        this.nm = nm;
    }
    handleEvent(ev) {
        this.S(ev.currentTarget[this.c || (this.c = ChkNm(ev.currentTarget, this.nm))]);
    }
}
function ApplyAtts(r, cr, ms, k = 0, xs) {
    ro = T;
    let e = r.n, cu = cr ? 1 : 2, hc, i = 0;
    try {
        for (let M of ms) {
            if (M.cu & cu) {
                let nm = M.nm, x = xs ? xs[i] : evM(M);
                switch (M.mt) {
                    case 0:
                        e.setAttribute(nm, x);
                        break;
                    case 1:
                        if (M.isS ?? (M.isS = typeof e[M.c = ChkNm(e, nm == 'for' ? 'htmlFor'
                            : nm == 'valueasnumber'
                                ? 'value'
                                : nm)] == 'string'))
                            x = x == N || x != x ? Q : x.toString();
                        if (x != e[nm = M.c])
                            e[nm] = x;
                        break;
                    case 8:
                        cr &&
                            EL(e, M.ev, (r[k] = new Targ(nm)));
                        r[k].S = x;
                        break;
                    case 7:
                        cr &&
                            EL(e, nm, r[k] = new Hndlr);
                        r[k].h = x;
                        if (M.ap)
                            hc || (hc = x);
                        break;
                    case 4:
                        if (x)
                            typeof x == 'string'
                                ? (e.style = x)
                                : ass(e.style, x);
                        break;
                    case 2:
                        e.style[M.c || (M.c = ChkNm(e.style, nm))] = x || x === 0 ? x : Q;
                        break;
                    case 6:
                        e[nm] = x.replace(M.ev ? /(.+?)(,|$)/gs : /(.+)()/s, (_, u, r) => new URL(u, M.fp).href + r);
                        break;
                    case 5:
                        ass(e, x);
                        break;
                    case 3:
                        let p = r[k], n = M.cu & 2 ? (r[k] = new Set) : N;
                        (function AC(x) {
                            if (x)
                                switch (typeof x) {
                                    default: throw `Invalid value`;
                                    case 'string':
                                        for (let C of x.split(/\s+/))
                                            if (C) {
                                                p?.delete(C)
                                                    || e.classList.add(C);
                                                n?.add(C);
                                            }
                                        break;
                                    case 'object':
                                        if (Array.isArray(x))
                                            x.forEach(AC);
                                        else
                                            for (let [nm, b] of Object.entries(x))
                                                b && AC(nm);
                                }
                        })(x);
                        if (p)
                            for (let v of p)
                                e.classList.remove(v);
                        break;
                    case 9:
                        if (x)
                            k = ApplyAtts(r, cr, x.ms, k, x.xs);
                        break;
                    case 10:
                        x(nm ? e[M.c || (M.c = ChkNm(e, nm))] : e);
                        break;
                    case 11:
                        if (!e.download
                            && !e.target
                            && e.href.startsWith(L.origin + dL.basepath))
                            EL(e, 'click', reroute);
                }
            }
            i++;
            k++;
        }
    }
    finally {
        ro = F;
    }
    if (hc !== U)
        e.style.cursor = hc && !e.disabled ? 'pointer' : Q;
    return k;
}
let iRC = 0, iLS = 0;
class RComp {
    constructor(RC, SRC, settings, CT = RC?.CT) {
        ass(this, { num: iRC++,
            S: { ...RC ? RC.S : dflts, ...settings },
            src: SRC || RC?.src,
            doc: RC?.doc || D,
            CT: new Context(CT, T),
            lscl: RC?.lscl || E,
            ndcl: RC?.ndcl || 0,
            rActs: [],
            sPRE: new Set(['PRE']),
            ws: 1,
            rt: T
        });
        this.fp = this.src.replace(/[^/]*$/, Q);
        this.hd = RC?.hd || this.doc.head;
        this.bDR = this.S.bDollarRequired ? 1 : 0;
    }
    Framed(Comp) {
        let { CT, rActs } = this, { ct, d, L, M } = CT, A = rActs.length, nf = L - M;
        if (nf) {
            CT.ct = `[${ct}]`;
            CT.d++;
            CT.L = CT.M = 0;
        }
        return Comp((sub, r) => {
            let e = env;
            r || ({ r, sub } = PrepRng(sub));
            env = r.env || (r.env = ass([nf ? e : e[0]], { cl: e.cl }));
            return { sub, EF: () => env = e };
        }).finally(() => {
            this.CT = ass(CT, { ct, d, L, M });
            while (rActs.length > A)
                rActs.pop()();
        });
    }
    SS() {
        let { CT, rActs } = this, { ct, L } = CT, A = rActs.length;
        return () => {
            CT.ct = ct
                + ','.repeat(CT.L - L);
            while (rActs.length > A)
                rActs.pop()();
        };
    }
    LV(nm) {
        if (nm = nm?.trim()) {
            try {
                if (!/^[A-Z_$][A-Z0-9_$]*$/i.test(nm))
                    throw N;
                V(`let ${nm}=0`);
            }
            catch {
                throw `Invalid identifier '${nm}'`;
            }
            let { CT } = this, i = ++CT.L, vM = CT.lvM, p = vM.get(nm);
            vM.set(nm, { d: CT.d, i });
            this.rActs.push(() => mapSet(vM, nm, p));
            CT.ct = CT.ct.replace(new RegExp(`\\b${nm}\\b`), Q)
                + ',' + nm;
            var lv = (v => env[i] = v);
        }
        else
            lv = dU;
        lv.nm = nm;
        return lv;
    }
    LVars(varlist) {
        return Array.from(split(varlist), nm => this.LV(nm));
    }
    LCons(listS) {
        let { CT } = this, { csM: cM, M, d } = CT;
        for (let S of listS) {
            let m = S.nm, p = cM.get(m);
            cM.set(m, { S, k: { d, i: --CT.M } });
            this.rActs.push(() => mapSet(cM, m, p));
        }
        return (CDefs) => {
            let i = M;
            for (let C of CDefs)
                env[--i] = C;
        };
    }
    async Compile(elm, nodes) {
        for (let tag of this.S.preformatted)
            this.sPRE.add(tag.toUpperCase());
        this.srcCnt = 0;
        let t0 = now(), b = (nodes
            ? await this.CIter(nodes)
            : await this.CElm(elm, T)) || dB;
        this.log(`Compiled ${this.srcCnt} nodes in ${(now() - t0).toFixed(1)} ms`);
        return this.bldr = b;
    }
    log(msg) {
        if (this.S.bTiming)
            console.log(new Date().toISOString().substring(11) + ` ${this.num}: ` + msg);
    }
    async Build(a) {
        R = this;
        env = [];
        pN = a.pN;
        try {
            await this.bldr(a);
        }
        finally {
            env = U;
        }
        await DoUpdate();
    }
    CChilds(PN, nodes = PN.childNodes) {
        let ES = this.SS();
        return this.CIter(nodes).finally(ES);
    }
    async CIter(iter) {
        let { rt } = this, arr = Array.from(iter), L = arr.length, bs = [], i = 0;
        while (rt && L && !/[^ \t\n\r]/.test(arr[L - 1]?.nodeValue))
            L--;
        while (i < L) {
            let srcN = arr[i++], bl;
            this.rt = i == L && rt;
            switch (srcN.nodeType) {
                case 1:
                    this.srcCnt++;
                    bl = await this.CElm(srcN);
                    break;
                case 8:
                    if (!this.S.bKeepComments)
                        break;
                    var bC = T;
                case 3:
                    this.srcCnt++;
                    let str = srcN.nodeValue, getText = this.CText(str), { fx } = getText;
                    if (fx !== Q) {
                        bl = async (a) => {
                            arA && arChk();
                            arR = a.r;
                            arB = bl;
                            PrepData(arA = a, getText(), bC);
                            arChk();
                        };
                        if (!bC && this.ws < 4)
                            this.ws = / $/.test(str) ? 2 : 3;
                    }
            }
            if (bl)
                bs.push(bl);
        }
        return (L = bs.length) ?
            L < 2 ? bs[0]
                : async function Iter(a) {
                    for (let b of bs)
                        await b(a);
                }
            : N;
    }
    async CElm(srcE, bI) {
        try {
            let RC = this, tag = srcE.tagName, ats = new Atts(srcE), ga = [], bf = [], af = [], bl, bA, constr = RC.CT.getCS(tag), b, m, nm, ws = RC.ws;
            for (let [at] of ats)
                if (m =
                    /^#?(?:(((this)?reacts?on|(on))|on((error)|success)|(hash)|(if)|renew)|(?:(before)|on|after)(?:create|update|destroy|compile)+)$/
                        .exec(at))
                    if (m[1])
                        m[4] && tag != 'REACT'
                            || m[7] && tag == 'FOR'
                            || ga.push({
                                at,
                                m,
                                dV: m[5]
                                    ? RC.CHandlr(ats.g(at), at)
                                    : m[8]
                                        ? RC.CAttExp(ats, at)
                                        :
                                            RC.CAttExps(ats, at)
                            });
                    else {
                        let txt = ats.g(at);
                        if (/cr|d/.test(at))
                            (m[9] ? bf : af)
                                .push({
                                at,
                                txt,
                                C: /cr/.test(at),
                                U: /u/.test(at),
                                D: /y/.test(at),
                                h: m[9] && RC.CHandlr(txt, at)
                            });
                        if (/m/.test(at))
                            TryV(`(function(){${txt}\n})`, at).call(srcE);
                    }
            if (constr)
                bl = await RC.CInst(srcE, ats, constr);
            else
                switch (tag) {
                    case 'DEF':
                    case 'DEFINE': {
                        NoChilds(srcE);
                        let rv = ats.g('rvar'), vLet = RC.LV(rv || ats.g('let') || ats.g('var', T)), { G, S } = RC.cAny(ats, 'value'), bU = ats.gB('updating') || rv, dUpd = rv && RC.CAttExp(ats, 'updates'), onMod = rv && RC.CPam(ats, 'onmodified'), dSto = rv && RC.CAttExp(ats, 'store'), dSNm = dSto && RC.CPam(ats, 'storename');
                        bA = async function DEF(a, bR) {
                            let { cr, r } = PrepRng(a, srcE), v;
                            if (bU || arChk() || cr || bR != N) {
                                ro = T;
                                try {
                                    v = G?.();
                                }
                                finally {
                                    ro = F;
                                }
                                if (rv) {
                                    if (onMod)
                                        (r.om || (r.om = new Hndlr)).h = onMod();
                                    if (cr) {
                                        let lr = vLet(r.rv =
                                            RVAR(U, dr(v), dSto?.(), S?.(), dSNm?.() || rv, dUpd?.()));
                                        r.om && lr.Subscribe(x => r.om.handleEvent(x));
                                    }
                                    else
                                        r.rv.Set(dr(v));
                                }
                                else
                                    vLet(v);
                            }
                        };
                        break;
                    }
                    case 'IF':
                    case 'CASE':
                        bl = await RC.CCase(srcE, ats);
                        break;
                    case 'FOR':
                        bl = await RC.CFor(srcE, ats);
                        break;
                    case 'MODULE':
                        ats.g('id');
                        break;
                    case 'INCLUDE':
                        bl = await RC.CIncl(srcE, ats, T);
                        break;
                    case 'IMPORT': {
                        let src = ats.g('src', T), bIncl = ats.gB('include'), bAsync = ats.gB('async'), lvars = RC.LVars(ats.g('defines')), imps = Array.from(mapI(srcE.children, ch => new Signat(ch, RC))), DC = RC.LCons(imps), cTask = OMods.get(src);
                        if (!cTask) {
                            let C = new RComp(RC, RC.gURL(src), { bSubf: T }, new Context);
                            C.log(src);
                            cTask =
                                RC.fetchM(src)
                                    .then(iter => C.Compile(N, iter))
                                    .then(b => [b, C.CT]);
                            if (RC.S.bSubf != 2)
                                OMods.set(src, cTask);
                        }
                        let task = cTask.then(([b, CT]) => {
                            for (let sig of imps) {
                                let { S, dC } = CT.getCS(sig.nm)
                                    || thro(`<${sig.nm}> is missing in '${src}'`);
                                bAsync
                                    ? !sig.IsCompat(S) && thro(`Import signature ${sig.srcE.outerHTML} is incompatible with module signature ${S.srcE.outerHTML}`)
                                    : ass(sig, S);
                                sig.g = dC;
                            }
                            for (let lv of lvars)
                                lv.g = CT.getLV(lv.nm);
                            return b;
                        });
                        if (!bAsync)
                            for (let sig of imps)
                                sig.task = task;
                        bA = async function IMPORT(a) {
                            let { sub, cr, r } = PrepRng(a, srcE);
                            arA = N;
                            if (cr || bIncl) {
                                try {
                                    var b = await NoTime(task), s = env, MEnv = env = r.v || (r.v = []);
                                    await b(bIncl ? sub : { pN: D.createDocumentFragment() });
                                }
                                finally {
                                    env = s;
                                }
                                DC(mapI(imps, S => S.g(MEnv)));
                                for (let lv of lvars)
                                    lv(lv.g(MEnv));
                            }
                        };
                        break;
                    }
                    case 'REACT':
                        b = await RC.CChilds(srcE);
                        bl = b && function (a, bR) {
                            return !(a.r && bR) && b(a);
                        };
                        break;
                    case 'RHTML': {
                        let S = RC.CPam(ats, 'srctext', T), dO = RC.CPam(ats, "onc"), s = { bSubf: 2, bTiming: RC.S.bTiming };
                        NoChilds(srcE);
                        bl = async function RHTML(a) {
                            let { r } = PrepElm(a, 'r-html'), src = S();
                            if (src != r.src) {
                                let sv = env, C = new RComp(N, dL.href, s), sh = C.hd = r.n.shadowRoot || r.n.attachShadow({ mode: 'open' }), pR = r.rR || (r.rR = new Range(N, N, tag)), tmp = D.createElement(tag);
                                (C.doc = D.createDocumentFragment()).appendChild(tmp);
                                pR.erase(sh);
                                sh.innerHTML = Q;
                                try {
                                    tmp.innerHTML = r.src = src;
                                    C.ws = ws;
                                    await C.Compile(tmp, tmp.childNodes);
                                    dO && dO()(U);
                                    await C.Build({ pN: sh, pR });
                                }
                                catch (e) {
                                    sh.appendChild(crErrN(e));
                                }
                                finally {
                                    env = sv;
                                }
                            }
                        };
                        break;
                    }
                    case 'SCRIPT':
                        bA = await RC.CScript(srcE, ats);
                        break;
                    case 'COMPONENT':
                        bA = await RC.CComp(srcE, ats);
                        break;
                    case 'DOCUMENT':
                        let vNm = RC.LV(ats.g('name', T));
                        bA = await RC.Framed(async (SF) => {
                            let bEncaps = ats.gB('encapsulate'), C = new RComp(RC), vPams = C.LVars(ats.g('params')), vWin = C.LV(ats.g('window', F, F, T)), H = C.hd = D.createDocumentFragment(), b = await C.CChilds(srcE);
                            return async function DOCUMENT(a) {
                                if (PrepRng(a).cr) {
                                    let { doc, hd } = RC, docEnv = env, wins = new Set;
                                    vNm({
                                        async render(w, cr, args) {
                                            let s = env, Cdoc = C.doc = w.document;
                                            C.hd = Cdoc.head;
                                            env = docEnv;
                                            let { sub } = SF({ pN: Cdoc.body });
                                            SetLVs(vPams, args);
                                            vWin(w);
                                            try {
                                                if (cr) {
                                                    if (!bEncaps)
                                                        for (let SSh of hd.styleSheets || doc.styleSheets) {
                                                            let DSh = Cdoc.head.appendChild(D.createElement('style')).sheet;
                                                            for (let rule of SSh.cssRules)
                                                                DSh.insertRule(rule.cssText);
                                                        }
                                                    for (let S of H.childNodes)
                                                        Cdoc.head.append(S.cloneNode(T));
                                                }
                                                await b(sub);
                                            }
                                            finally {
                                                env = s;
                                            }
                                        },
                                        open(target, features, ...args) {
                                            let w = W.open(Q, target || Q, features), cr = !chWins.has(w);
                                            if (cr) {
                                                EL(w, 'keydown', (ev) => ev.key == 'Escape' && w.close());
                                                EL(w, 'close', _ => { chWins.delete(w); wins.delete(w); });
                                                chWins.add(w);
                                                wins.add(w);
                                            }
                                            w.document.body.innerHTML = Q;
                                            this.render(w, cr, args);
                                            return w;
                                        },
                                        async print(...args) {
                                            let f = D.createElement('iframe');
                                            f.hidden = T;
                                            D.body.appendChild(f);
                                            await this.render(f.contentWindow, T, args);
                                            f.contentWindow.print();
                                            f.remove();
                                        },
                                        closeAll: () => wins.forEach(w => w.close())
                                    });
                                }
                            };
                        });
                        break;
                    case 'RHEAD':
                        RC.ws = RC.rt = 1;
                        bl = await RC.CUncN(srcE, U, RC.hd);
                        RC.ws = ws;
                        break;
                    case 'STYLE': {
                        let src = ats.g('src'), sc = ats.g('scope'), nm, { lscl: l, hd } = RC;
                        if (sc) {
                            /^local$/i.test(sc) || thro('Invalid scope');
                            nm = `\uFFFE${iLS++}`;
                            RC.lscl = [...l, nm];
                            RC.rActs.push(() => RC.lscl = l);
                        }
                        (src ? RC.FetchT(src) : Promise.resolve(srcE.innerText))
                            .then(txt => {
                            srcE.innerHTML = RC.AddC(txt, nm, src);
                            hd.appendChild(srcE);
                        });
                        ats.clear();
                        break;
                    }
                    case 'RSTYLE': {
                        let dr = RC.bDR, sc = ats.g('scope'), { bf, af } = RC.CAtts(ats), i;
                        try {
                            RC.bDR = 1;
                            RC.ws = 1;
                            let b = await (sc ?
                                (/^local$/i.test(sc) || thro('Invalid scope')
                                    , (i = RC.ndcl++)
                                    , RC.rActs.push(() => RC.ndcl--)
                                    , RC.CUncN(srcE, ats))
                                : RC.CIncl(srcE, ats));
                            bl = b && async function RSTYLE(a) {
                                let { r, cr, sub } = PrepElm(a, 'STYLE'), k = ApplyAtts(r, cr, bf);
                                if (sc) {
                                    let txt = (await b(a)).innerText, nm = r.cn || (r.cn = `\uFFFE${iLS++}`);
                                    if (txt != r.tx)
                                        r.n.innerHTML = RC.AddC(r.tx = txt, nm);
                                    (env.cl = r.cl || (r.cl = [...env.cl || E]))[i] = nm;
                                }
                                else
                                    await b(sub);
                                ApplyAtts(r, cr, af, k);
                            };
                        }
                        finally {
                            RC.bDR = dr;
                            RC.ws = ws;
                        }
                        break;
                    }
                    case 'ELEMENT':
                        bl = await RC.CHTML(srcE, ats, RC.CPam(ats, 'tagname', T));
                        RC.ws = 3;
                        break;
                    case 'ATTRIBUTE':
                        NoChilds(srcE);
                        let dN = RC.CPam(ats, 'name', T), dV = RC.CPam(ats, 'value', T);
                        bl = async function ATTRIB(a) {
                            let { r, cr } = PrepRng(a, srcE), nm = dN();
                            if (cr)
                                r.aD = () => pN.removeAttribute(r.v);
                            if (r.v && nm != r.v)
                                r.aD();
                            if (r.v = nm)
                                pN.setAttribute(nm, dV());
                        };
                        break;
                    case 'COMMENT':
                        RC.rt = F;
                        RC.ws = 4;
                        let c = await RC.CUncN(srcE);
                        bl = async function COMMENT(a) {
                            PrepData(a, (await c(a)).innerText, T);
                        };
                        RC.ws = ws;
                        break;
                    default:
                        bl = await RC.CHTML(srcE, ats);
                }
            bI || ats.None();
            nm = (bl || (bl = bA || (bA = dB))).name;
            if (bf.length || af.length) {
                for (let g of af)
                    g.h = RC.CHandlr(g.txt, g.at);
                let b = bl;
                bl = async function Pseu(a, bR) {
                    let { r, sub, cr } = PrepRng(a, srcE), sr = sub.r || T, bD = ph(bf, 'bU', sr != T && sr.n || pN);
                    await b(sub, bR);
                    let rng = cr
                        ? sub.prR
                        : sr, aD = ph(af, 'aU', rng.n || pN);
                    if (cr)
                        ass(rng, { bD, aD });
                    function ph(hh, U, elm) {
                        if (cr) {
                            for (let g of hh) {
                                let h = g.h();
                                if (g.C)
                                    h.call(elm);
                                if (g.U)
                                    r[U] = h;
                                if (g.D)
                                    var D = h;
                            }
                            return D;
                        }
                        r[U]?.call(elm);
                    }
                };
            }
            for (let { at, m, dV } of RC.S.version ? ga : ga.reverse()) {
                let b = bl, es = m[6] ? 'e' : 's', bA = !m[3];
                if (m[2])
                    bl = RC.ErrH(function on(a, bR) {
                        for (let rv of dV())
                            if (rv) {
                                if (!rv.$SR)
                                    throw `This is not an RVAR\nat '${at}'`;
                                AR(rv, bA);
                            }
                        return b(PrepRng(a, srcE).sub, bR);
                    }, srcE);
                else
                    bl =
                        m[5]
                            ? async function SetOnES(a, bR) {
                                let s = oes, { sub, r } = PrepRng(a, srcE, at);
                                oes = ass(r.oes || (r.oes = {}), oes);
                                try {
                                    oes[es] = dV();
                                    await b(sub, bR);
                                }
                                finally {
                                    oes = s;
                                }
                            }
                            : m[7]
                                ? function HASH(a, bR) {
                                    let { sub, r, cr } = PrepRng(a, srcE, at), ph = r.v;
                                    r.v = dV();
                                    if (cr || r.v.some((hash, i) => hash !== ph[i]))
                                        return b(sub, bR);
                                }
                                : m[8]
                                    ? function hIf(a, bR) {
                                        let c = dr(dV()), p = PrepRng(a, srcE, at, 1, !c);
                                        if (c)
                                            return b(p.sub, bR);
                                    }
                                    :
                                        function renew(sub, bR) {
                                            return b(PrepRng(sub, srcE, at, 2).sub, bR);
                                        };
            }
            return bl != dB && ass(RC.ErrH(bl, srcE, !!bA), { nm });
        }
        catch (m) {
            throw ErrM(srcE, m);
        }
    }
    ErrH(b, srcN, bA) {
        let bl = b && (async (a, bR) => {
            let r = a.r;
            if (r?.eN) {
                pN.removeChild(r.eN);
                r.eN = U;
            }
            try {
                arA && arChk();
                arR = a.r;
                arB = bl;
                let prom = b(arA = a, bR);
                arA && arChk();
                await prom;
                pN = a.pN;
            }
            catch (m) {
                pN = a.pN;
                if (m) {
                    let msg = srcN instanceof HTMLElement ? ErrM(srcN, m, 45) : m, e = oes.e;
                    if (this.S.bAbortOnError)
                        throw msg;
                    this.log(msg);
                    e ? e(m)
                        : this.S.bShowErrors ?
                            (r || {}).eN = pN.insertBefore(crErrN(msg), a.r?.FstOrNxt)
                            : U;
                    if (bA)
                        throw Q;
                }
            }
        });
        return bl;
    }
    CIncl(srcE, ats, bR, cn = srcE.childNodes) {
        let src = ats?.g('src', bR);
        return src ?
            this.Framed(async (SF) => {
                let C = new RComp(this, this.gURL(src), { bSubf: T }), task = srcE.children.length || srcE.textContent.trim()
                    ? C.Compile(N, cn)
                    : this.fetchM(src).then(cn => C.Compile(N, cn));
                return async function INCL(a) {
                    PrepRng(a, srcE);
                    arChk();
                    let { sub, EF } = SF(a);
                    await (await NoTime(task))(sub).finally(EF);
                };
            })
            : this.CChilds(srcE, cn);
    }
    async CUncN(srcE, ats, p = F) {
        let b = await this.CIncl(srcE, ats);
        return b && (async (a) => {
            let { r, sub } = PrepRng(a, srcE);
            pN = sub.pN = r.p || (r.p = (r.pN = p) || D.createElement(srcE.tagName));
            sub.bfor = N;
            try {
                await b(sub);
            }
            finally {
                pN = a.pN;
            }
            return !p && r.p;
        });
    }
    async CScript(srcE, ats) {
        let { type, text, defer, async } = srcE, src = ats.g('src'), defs = ats.g('defines') || '', m = /^\s*(((text|application)\/javascript|(module)|)|(otoreact)(\/(((local)|static)|global)|(.*?)))\s*(;\s*type\s*=\s*(")?module\12)?\s*$|/i.exec(type), bU = ats.gB('updating'), { ct } = this.CT, lvars = m[8] && this.LVars(defs), ex;
        ats.clear();
        if (m[5] && (!m[10] || thro("Invalid script type"))
            || m[2] != N && this.S.bSubf) {
            if (m[9]) {
                let prom = (async () => V(US + `(function([${ct}]){{\n${src ? await this.FetchT(src) : text}\nreturn{${defs}}}})`))();
                ex = async () => (await prom)(env);
            }
            else if (m[4] || m[11])
                ex = K(src
                    ? import(this.gURL(src))
                    : import(src = URL.createObjectURL(new Blob([text.replace(/\/\/.*|\/\*[^]*?\*\/|(['"`])(?:\\.|[^])*?\1|(\bimport\b(?:(?:[a-zA-Z0-9_,*{}]|\s)*\bfrom)?\s*(['"]))(.*?)\3/g, (p0, _, p2, p3, p4) => p2 ? p2 + this.gURL(p4) + p3 : p0)], { type: 'text/javascript' }))).finally(() => URL.revokeObjectURL(src)));
            else {
                let pTxt = (async () => `${m[5] ? US : Q}${src ? await this.FetchT(src) : text}\n;({${defs}})`)(), Xs;
                ex = async () => Xs || (Xs = V(await pTxt));
                if (src && async)
                    ex();
                else if (!m[5] && !defer)
                    await ex();
            }
            return async function SCRIPT(a) {
                PrepRng(a, srcE);
                bU || arChk();
                if (!a.r || bU) {
                    let obj = await ex();
                    if (lvars)
                        lvars.forEach(lv => lv(obj[lv.nm]));
                    else
                        ass(G, obj);
                }
            };
        }
    }
    async CCase(srcE, ats) {
        let bH = ats.gB('hiding'), dV = this.CAttExp(ats, 'value'), cases = [], body = [], bI = srcE.tagName == 'IF', bT, bE;
        for (let n of srcE.childNodes) {
            if (n instanceof HTMLElement)
                switch (n.tagName) {
                    case 'THEN':
                        bT = cases.push({ n, ats });
                        new Atts(n).None();
                        continue;
                    case 'ELSE':
                        if (bE)
                            throw "Double <ELSE>";
                        bE = T;
                    case 'WHEN':
                        cases.push({ n, ats: new Atts(n) });
                        if (bI && !bE)
                            throw "<IF> contains <WHEN>";
                        continue;
                }
            body.push(n);
        }
        if (bI && !bT)
            cases.unshift({ n: srcE, ats, body });
        let aList = [], { ws, rt, CT } = this, postCT = CT, postW = 0;
        for (let { n, ats, body } of cases) {
            if (!bH)
                this.CT = new Context(CT);
            let ES = ass(this, { ws, rt }).SS(), cond, not = F, patt, p;
            try {
                switch (n.tagName) {
                    case 'IF':
                    case 'THEN':
                    case 'WHEN':
                        cond = this.CAttExp(ats, 'cond');
                        not = ats.gB('not');
                        patt = dV && ((p = ats.g('match') ?? ats.g('pattern')) != N
                            ? this.CPatt(p)
                            : (p = ats.g('urlmatch')) != N
                                ? this.CPatt(p, T)
                                : (p = ats.g('regmatch') || ats.g('regexp')) != N
                                    ? { RE: new RegExp(p, 'i'),
                                        lvars: this.LVars(ats.g('captures'))
                                    }
                                    : N);
                        if (patt?.lvars.length && (bH || not))
                            throw `Pattern capturing can't be combined with 'hiding' or 'not'`;
                    case 'ELSE':
                        aList.push({
                            cond, not, patt,
                            b: await this.CIncl(n, ats, F, body) || dB,
                            n
                        });
                        ats.None();
                        postW = Math.max(postW, this.ws);
                        postCT = postCT.max(this.CT);
                }
            }
            catch (m) {
                throw bI ? m : ErrM(n, m);
            }
            finally {
                ES();
            }
        }
        this.ws = !bE && ws > postW ? ws : postW;
        this.CT = postCT;
        return aList.length && async function CASE(a, bR) {
            let val = dr(dV?.()), RRE, cAlt;
            try {
                for (var alt of aList)
                    if (!((!alt.cond || dr(alt.cond()))
                        && (!alt.patt || val != N && (RRE = alt.patt.RE.exec(val)))) == alt.not) {
                        cAlt = alt;
                        break;
                    }
            }
            catch (m) {
                throw alt.n == srcE ? m : ErrM(alt.n, m);
            }
            finally {
                if (bH) {
                    for (let alt of aList) {
                        let { r, sub, cr } = PrepElm(a, 'WHEN');
                        if (!(r.n.hidden = alt != cAlt) && !bR
                            || cr)
                            await alt.b(sub);
                    }
                }
                else {
                    let { sub, cr } = PrepRng(a, srcE, Q, 1, cAlt);
                    if (cAlt) {
                        if (RRE)
                            RRE.shift(),
                                SetLVs(cAlt.patt.lvars, cAlt.patt.url ? RRE.map(decodeURIComponent) : RRE);
                        if (cr || !bR)
                            await cAlt.b(sub);
                    }
                }
            }
        };
    }
    CFor(srcE, ats) {
        let letNm = ats.g('let'), ixNm = ats.g('index', F, F, T);
        this.rt = F;
        if (letNm != N) {
            let dOf = this.CAttExp(ats, 'of', T), pvNm = ats.g('previous', F, F, T), nxNm = ats.g('next', F, F, T), dUpd = this.CAttExp(ats, 'updates'), bRe = gRe(ats) || dUpd;
            return this.Framed(async (SF) => {
                let vLet = this.LV(letNm), vIx = this.LV(ixNm), vPv = this.LV(pvNm), vNx = this.LV(nxNm), dKey = this.CAttExp(ats, 'key'), dHash = this.CAttExps(ats, 'hash'), b = await this.CIter(srcE.childNodes);
                return b && async function FOR(a) {
                    let iter = dr(dOf()) || E, { r, sub } = PrepRng(a, srcE, Q), sEnv = { env, oes }, u = r.u = r.u + 1 || 0;
                    ;
                    if (iter instanceof Promise)
                        iter.then(it => AJ({ Ex: () => r.u == u && updFor(it) }), sEnv.oes.e);
                    else
                        await updFor(iter);
                    async function updFor(iter) {
                        ({ env, oes } = sEnv);
                        let si = Symbol.iterator in iter
                            || (Symbol.asyncIterator in iter ? arChk()
                                : thro(`[of] Value (${iter}) is not iterable`)), kMap = r.v || (r.v = new Map), nMap = new Map, ix = 0, { EF } = SF(N, {});
                        try {
                            if (si)
                                for (let i of iter)
                                    ci(i);
                            else
                                for await (let i of iter)
                                    ci(i);
                            function ci(it) {
                                vLet(it);
                                vIx(ix);
                                let hash = dHash?.(), key = dKey?.() ?? hash?.[0];
                                if (key != N && nMap.has(key))
                                    throw `Duplicate key '${key}'`;
                                nMap.set(key ?? {}, { it, key, hash, ix: ix++ });
                            }
                        }
                        finally {
                            EF();
                        }
                        arChk();
                        let L = nMap.size, x, { pN } = sub, bfor = sub.bfor !== U ? sub.bfor : r.Nxt, nxR = r.ch, bf, iter2 = nMap.values(), nxIR = iter2.next(), prIt, prR, k, EC = () => {
                            while (nxR && !nMap.has(k = nxR.key)) {
                                if (k != N)
                                    kMap.delete(k);
                                nxR.erase(pN);
                                if (nxR.rv)
                                    nxR.rv.$subs.delete(nxR);
                                nxR.pv = N;
                                nxR = nxR.nx;
                            }
                            bf = nxR?.FstOrNxt || bfor;
                        };
                        sub.pR = r;
                        while (!nxIR.done) {
                            EC();
                            let { it, key, hash, ix } = nxIR.value, chR = kMap.get(key), cr = !chR, chAr;
                            if (cr) {
                                sub.r = N;
                                sub.prR = prR;
                                sub.bfor = bf;
                                ({ r: chR, sub: chAr } = PrepRng(sub));
                                if (key != N)
                                    kMap.set(key, chR);
                                chR.key = key;
                            }
                            else {
                                while (nxR != chR) {
                                    if (!chR.mov) {
                                        if ((x = nMap.get(nxR.key).ix - ix)
                                            * x > L) {
                                            nxR.mov = T;
                                            nxR = nxR.nx;
                                            EC();
                                            continue;
                                        }
                                        chR.pv.nx = chR.nx;
                                        if (chR.nx)
                                            chR.nx.pv = chR.pv;
                                    }
                                    for (let n of chR.Nodes())
                                        pN.insertBefore(n, bf);
                                    chR.mov = F;
                                    chR.nx = nxR;
                                    break;
                                }
                                nxR = chR.nx;
                                sub.r = chR;
                                chAr = PrepRng(sub).sub;
                                sub.pR = N;
                            }
                            chR.pv = prR;
                            chR.text = `${letNm}(${ix})`;
                            if (prR)
                                prR.nx = chR;
                            else
                                r.ch = chR;
                            prR = chR;
                            nxIR = iter2.next();
                            let { sub: iSub, EF } = SF(chAr, chR), rv = chR.rv;
                            try {
                                if (ixNm)
                                    vIx(chR.ix || (chR.ix = new RV(ixNm))).V = ix;
                                if (bRe)
                                    if (cr)
                                        vLet(chR.rv = RVAR(U, it, N, N, N, dUpd?.()));
                                    else
                                        vLet(rv).$V = it;
                                else
                                    vLet(it);
                                vPv(prIt);
                                vNx(nxIR.value?.item);
                                if (cr || !hash || hash.some((h, i) => h != chR.hash[i]))
                                    rv ?
                                        AJ(rv)
                                        :
                                            await b(iSub);
                            }
                            finally {
                                EF();
                            }
                            chR.hash = hash;
                            prIt = it;
                        }
                        EC();
                        if (prR)
                            prR.nx = N;
                        else
                            r.ch = N;
                    }
                    ;
                };
            });
        }
        else {
            let nm = ats.g('of', T, T).toUpperCase(), { S, dC } = this.CT.getCS(nm) ||
                thro(`Missing attribute [let]`);
            return this.Framed(async (SF) => {
                let vIx = this.LV(ixNm), DC = this.LCons([S]), b = await this.CChilds(srcE);
                return b && async function FOREACH_Slot(a) {
                    let { tmps, env } = dC(), { EF, sub } = SF(a), i = 0;
                    try {
                        for (let slotBldr of tmps) {
                            vIx(i++);
                            DC([
                                { nm, tmps: [slotBldr], env }
                            ]);
                            await b(sub);
                        }
                    }
                    finally {
                        EF();
                    }
                };
            });
        }
    }
    async CComp(srcE, ats) {
        let bRec = ats.gB('recursive'), { hd, ws } = this, eStyles = ats.gB('encapsulate')
            && (this.hd = D.createDocumentFragment()).children, arr = Array.from(srcE.children), eSig = arr.shift() || thro('Missing signature(s)'), eTem = arr.pop(), t = /^TEMPLATE(S)?$/.exec(eTem?.tagName) || thro('Missing template(s)'), sigs = [], CDefs = [];
        for (let elm of /^SIGNATURES?$/.test(eSig.tagName)
            ? eSig.children
            : [eSig])
            sigs.push(new Signat(elm, this));
        try {
            var DC = bRec && this.LCons(sigs), ES = this.SS(), b = this.ErrH(await this.CIter(arr), srcE, T)
                || dB, mapS = new Map(mapI(sigs, S => [S.nm, S]));
            for (let [nm, elm, body] of t[1]
                ? mapI(eTem.children, elm => [elm.tagName, elm, elm])
                : [
                    [sigs[0].nm, eTem, eTem.content]
                ]) {
                CDefs.push({
                    nm,
                    tmps: [await this.CTempl(mapS.get(nm) || thro(`Template <${nm}> has no signature`), elm, F, U, body, eStyles)]
                });
                mapS.delete(nm);
            }
            for (let [nm] of mapS)
                throw `Signature <${nm}> has no template`;
        }
        finally {
            ES();
            ass(this, { head: hd, ws });
        }
        DC || (DC = this.LCons(sigs));
        return async function COMP(a) {
            DC(CDefs.map(C => ({ ...C, env })));
            await b(a);
        };
    }
    CTempl(S, srcE, bSlot, ats, body = srcE, eStyles) {
        return this.Framed(async (SF) => {
            this.ws = this.rt = 1;
            let atts = ats || new Atts(srcE), lvars = S.Pams.map(({ mode, nm }) => {
                let lnm = atts.g(nm) ?? atts.g(mode + nm);
                return [nm, this.LV(lnm || (lnm === Q || !bSlot ? nm : N))];
            }), DC = this.LCons(S.Slots.values()), b = await this.CIter(body.childNodes);
            ats || atts.None();
            return b && async function TEMPL(args, mSlots, env, a) {
                if (!a.r)
                    for (let { nm, pDf } of S.Pams)
                        if (pDf && args[nm] === U)
                            args[nm] = pDf();
                ro = F;
                let { sub, EF } = SF(a);
                for (let [nm, lv] of lvars)
                    lv(args[nm]);
                DC(mapI(S.Slots.keys(), nm => ({ nm,
                    tmps: mSlots.get(nm) || E,
                    env
                })));
                if (eStyles) {
                    let { r: { n }, sub: s, cr } = PrepElm(sub, /^[A-Z].*-/.test(S.nm) ? S.nm : 'RHTML-' + S.nm), SR = s.pN = n.shadowRoot || n.attachShadow({ mode: 'open' });
                    if (cr)
                        for (let sn of eStyles)
                            SR.appendChild(sn.cloneNode(T));
                    sub = s;
                }
                await b(sub).finally(EF);
            };
        }).catch(m => { throw `<${S.nm}> template: ` + m; });
    }
    async CInst(srcE, ats, { S, dC }) {
        await S.task;
        let { RP, CSlot, Slots } = S, gArgs = [], SBldrs = new Map(mapI(Slots, ([nm]) => [nm, []]));
        for (let { mode, nm, rq } of S.Pams)
            if (nm != RP) {
                let { G, S } = this.cAny(ats, nm, rq);
                mode == '@' && !S && (S = K(F));
                if (G)
                    gArgs.push({ nm, G, S });
            }
        let slotE, slot, nm;
        for (let n of Array.from(srcE.children))
            if ((slot = Slots.get(nm = (slotE = n).tagName))
                && slot != CSlot) {
                SBldrs.get(nm).push(await this.CTempl(slot, slotE, T));
                srcE.removeChild(n);
            }
        if (CSlot)
            SBldrs.get(CSlot.nm).push(await this.CTempl(CSlot, srcE, T, ats));
        if (RP) {
            let { af } = this.CAtts(ats, T);
            ro = T;
            gArgs.push({
                nm: RP,
                G: () => ({ ms: af, xs: af.map(evM) })
            });
            ro = F;
        }
        this.ws = 3;
        return async function INST(a, bR) {
            let { r, sub, cr } = PrepRng(a, srcE), sEnv = env, cdef = dC(), args = r.args || (r.args = { __proto__: N });
            if (cdef)
                try {
                    ro = T;
                    for (let { nm, G, S } of gArgs) {
                        let v = G();
                        if (!S
                            || v instanceof RV) {
                            bR && (bR = v == args[nm]);
                            args[nm] = v;
                        }
                        else if (cr)
                            args[nm] = RVAR(U, v, U, S());
                        else
                            args[nm].V = v;
                    }
                    arChk();
                    env = cdef.env;
                    if (cr || !bR)
                        for (let tmpl of cdef.tmps)
                            await tmpl?.(args, SBldrs, sEnv, sub);
                }
                finally {
                    env = sEnv;
                    ro = F;
                }
        };
    }
    async CHTML(srcE, ats, dTag) {
        let nm = dTag ? N : srcE.tagName.replace(/\.+$/, Q), preW = this.ws, postW, m;
        if (this.sPRE.has(nm) || /^.re/.test(srcE.style.whiteSpace)) {
            this.ws = 4;
            postW = 1;
        }
        else if (m = rBlock.exec(nm)) {
            this.ws = this.rt = 1;
            postW = m[2] ? 3 : 1;
        }
        if (preW == 4)
            postW = preW;
        let { bf, af } = this.CAtts(ats, nm == 'SELECT'), b = await this.CChilds(srcE), { lscl, ndcl } = this;
        if (postW)
            this.ws = postW;
        if (nm == 'A' && this.S.bAutoReroute && bf.every(({ nm }) => nm != 'click'))
            af.push({ mt: 11, d: dU, cu: 1 });
        bf.length || (bf = U);
        af.length || (af = U);
        return async function ELM(a, bR) {
            let { r, sub, cr } = PrepElm(a, nm || dTag()), k = bf && ApplyAtts(r, cr, bf), xs = (ro = af)?.map(evM);
            ro = F;
            if (cr) {
                for (let nm of lscl)
                    r.n.classList.add(nm);
                for (let i = 0; i < ndcl; i++)
                    r.n.classList.add(env.cl[i]);
            }
            if (cr || !bR)
                await b?.(sub);
            af && ApplyAtts(r, cr, af, k, xs);
        };
    }
    CAtts(ats, bAf) {
        let bf = [], af = [], k = 0, m, ap = this.S.bAutoPointer, addM = (mt, nm, d, cu, ev) => {
            let M = { mt, nm, d,
                cu: cu ||
                    (d.fx != N ? 1 : 3),
                ev
            };
            if (ap && mt == 7)
                M.ap = nm == 'click';
            if (mt == 6)
                M.fp = this.fp;
            (mt >= 9 || bAf ? af : bf).push(M);
            k++;
            return M;
        };
        for (let [A, V] of ats)
            if (m = /^(?:(([#+.](#)?)?(((class|classname)|style)(?:[.:](\w+))?|on(\w+)\.*|(src(set)?)|(\w*)\.*))|([\*\+#!]+|@@?)(\w*)|\.\.\.(\w+))$/.exec(A)) {
                let [, o, p, h, d, y, c, i, e, s, ss, a, t, w, r] = m;
                if (o) {
                    let dV = p ? this.CExpr(V, A)
                        : e ? this.CHandlr(V, A)
                            : this.CText(V, A), aa;
                    if (aa =
                        a == 'shown' ? 'hidden'
                            : a == 'enabled' ? 'disabled' : N) {
                        a = aa;
                        dV = B((b) => !b, dV);
                    }
                    if (a == 'visible') {
                        i = 'visibility';
                        dV = B((b) => b ? N : 'hidden', dV);
                    }
                    addM(c ? 3
                        : i ? 2
                            : y ? 4
                                : e ? 7
                                    : s ? 6
                                        : p ? d ? 1 : 5
                                            : 0, i || a || e || d, i && c
                        ? () => Object.fromEntries([[i, dV()]])
                        : dV, (e && !p || h) && 1, ss);
                }
                else if (t) {
                    let mP = /[@#](#)?/.exec(t), mT = /([@!])(\1)?/.exec(t), cu = /\*/.test(t)
                        + /\+/.test(t) * 2, { G, S } = this.cTwoWay(V, w, mT || cu);
                    (mP ? addM(1, w, G, mP[1] && 1) : {})
                        .T =
                        mT && addM(8, w, S, 1, mT[2] ? 'change' : 'input');
                    cu && addM(10, w, S, cu);
                }
                else {
                    if (V)
                        throw 'A rest parameter cannot have a value';
                    addM(9, A, this.CT.getLV(r));
                }
                ats.delete(A);
            }
        return { bf, af };
    }
    CText(text, nm) {
        var _a, _b;
        let f = (re) => `(?:\\{(?:\\{${re}\\}|[^])*?\\}\
|'(?:\\\\.|[^])*?'\
|"(?:\\\\.|[^])*?"\
|\`(?:\\\\[^]|\\\$\\{${re}}|[^])*?\`\
|/(?:\\\\.|\[]?(?:\\\\.|.)*?\])*?/\
|\\?\\.\
|\\?${re}:\
|[^])*?`, rIS = (_a = RComp.rIS)[_b = this.bDR] || (_a[_b] = new RegExp(`\\\\([{}])|\\$${this.bDR ? Q : '?'}\\{\\s*(${f(f(f('[^]*?')))})(?::\\s*(.*?))?\\s*\\}|$`, 'g')), gens = [], ws = nm || this.S.bKeepWhiteSpace ? 4 : this.ws, fx = Q, iT = T;
        rIS.lastIndex = 0;
        while (T) {
            let lastIx = rIS.lastIndex, m = rIS.exec(text);
            fx += text.slice(lastIx, m.index) + (m[1] || Q);
            if (!m[0] || m[2]) {
                if (ws < 4) {
                    fx = fx.replace(/[ \t\n\r]+/g, " ");
                    if (ws <= 2 && !gens.length)
                        fx = fx.replace(/^ /, Q);
                    if (this.rt && !m[0])
                        fx = fx.replace(/ $/, Q);
                }
                if (fx)
                    gens.push(fx);
                if (!m[0])
                    return iT ? ass(() => fx, { fx })
                        : () => {
                            let s = Q;
                            for (let g of gens)
                                s += typeof g == 'string' ? g : g()?.toString() ?? Q;
                            return s;
                        };
                let dE = this.CExpr(m[2], nm, U, '{}'), f = m[3];
                gens.push(f ? () => RFormat(dr(dE()), f) : dE);
                iT = fx = Q;
            }
        }
    }
    CPatt(patt, url) {
        let reg = Q, lvars = [], rP = /\{((?:[^}]|\\\})*)\}|(\?)|(\*)|\[\^?(?:\\[^]|[^\\\]])*\]|$/g;
        while (rP.lastIndex < patt.length) {
            let ix = rP.lastIndex, m = rP.exec(patt), lits = patt.slice(ix, m.index);
            reg +=
                lits.replace(/\W/g, s => '\\' + s)
                    + (m[1] != N ? (lvars.push(this.LV(m[1])), '(.*?)')
                        : m[2] ? '.'
                            : m[3] ? '.*'
                                : m[0]);
        }
        return { lvars, RE: new RegExp(`^${reg}$`, 'i'), url };
    }
    CPam(ats, at, bReq) {
        let txt = ats.g(at);
        return (txt == N ? this.CAttExp(ats, at, bReq)
            : /^on/.test(at) ? this.CHandlr(txt, at)
                : this.CText(txt, at));
    }
    CAttExp(ats, at, bReq) {
        return this.CExpr(ats.g(at, bReq, T), '#' + at, U);
    }
    cAny(ats, nm, rq) {
        let a = '@' + nm, exp = ats.g(a);
        return exp != N ? this.cTwoWay(exp, a)
            : {
                G: this.CPam(ats, nm, rq)
            };
    }
    cTwoWay(exp, nm, bT = T) {
        return {
            G: this.CExpr(exp, nm),
            S: bT && this.CRout(`(${exp}\n)=$`, '$', `\nin assigment target "${exp}"`)
        };
    }
    CHandlr(txt, nm) {
        return /^#/.test(nm) ?
            this.CExpr(txt, nm, txt)
            : this.CRout(txt, 'event', `\nat ${nm}="${Abbr(txt)}"`);
    }
    CRout(txt, x, i) {
        let ct = this.gsc(txt), C = TryV(`${US}(function(${x},${ct}){${txt}\n})`, i, Q);
        return (e = env) => function ($) {
            try {
                return C.call(this, $, e);
            }
            catch (m) {
                throw m + i;
            }
        };
    }
    CExpr(e, nm, src = e, dl = '""') {
        if (e == N)
            return e;
        e.trim() || thro(`${nm}: Empty expression`);
        var m = '\nat ' + (nm ? `${nm}=` : Q) + dl[0] + Abbr(src) + dl[1], f = TryV(`${US}(function(${this.gsc(e)}){return(${e}\n)})`, m, Q);
        return () => {
            try {
                return f.call(pN, env);
            }
            catch (e) {
                throw e + m;
            }
        };
    }
    CAttExps(ats, attNm) {
        let L = ats.g(attNm, F, T);
        if (L == N)
            return N;
        return this.CExpr(`[${L}\n]`, attNm);
    }
    gsc(exp) {
        let { ct, lvM, d } = this.CT, n = d + 1;
        for (let m of exp.matchAll(/\b[A-Z_$][A-Z0-9_$]*\b/gi)) {
            let k = lvM.get(m[0]);
            if (k?.d < n)
                n = k.d;
        }
        if (n > d)
            return Q;
        let p = d - n, q = p;
        while (n--)
            q = ct.indexOf(']', q) + 1;
        return `[${ct.slice(0, p)}${ct.slice(q)}]`;
    }
    gURL(src) {
        return new URL(src, this.fp).href;
    }
    AddC(txt, nm, src) {
        return `/* From ${src || this.src} */\n` + (nm ? txt.replaceAll(/{(?:{.*?}|.)*?}|@[msd].*?{|@[^{;]*|(?:\w*\|)?(\w|[-.#:()\u00A0-\uFFFF]|\[(?:(['"])(?:\\.|.)*?\2|.)*?\]|\\[0-9A-F]+\w*|\\.|(['"])(?:\\.|.)*?\3)+/gsi, (m, p) => p ? `${m}.${nm}` : m)
            : txt);
    }
    async FetchT(src) {
        return (await RFetch(this.gURL(src), { headers: this.S.headers })).text();
    }
    async fetchM(src) {
        let m = this.doc.getElementById(src), M = 'MODULE';
        if (!m) {
            let { head, body } = P.parseFromString(await this.FetchT(src), 'text/html'), e = body.firstElementChild;
            if (e?.tagName != M)
                return [...head.childNodes, ...body.childNodes];
            m = e;
        }
        else if (m.tagName != M)
            throw `'${src}' must be a <${M}>`;
        return m.childNodes;
    }
}
RComp.rIS = [];
class Atts extends Map {
    constructor(elm) {
        super();
        this.elm = elm;
        for (let a of elm.attributes)
            if (!/^_/.test(a.name))
                super.set(a.name, a.value);
    }
    g(nm, bReq, bHash, bI) {
        let m, gg = (nm) => {
            let v = super.get(m = nm);
            return v != N ? v :
                TryV(super.get(m = '%' + nm), m);
        }, v = gg(nm);
        if (v == N && bHash)
            v = gg('#' + nm);
        if (v != N)
            super.delete(m);
        else if (bReq)
            throw `Missing attribute '` + nm + `'`;
        return bI && v == Q ? nm : v;
    }
    gB(nm, df = F) {
        let v = this.g(nm), m = /^((false|no)|true|yes)?$/i.exec(v);
        return v == N ? df
            : m ? !m[2]
                : thro(`@${nm}: invalid value`);
    }
    None() {
        super.delete('hidden');
        if (this.size)
            throw `Unknown attribute(s): ${Array.from(super.keys()).join(',')}`;
    }
}
const dU = _ => U, dB = async (a) => { PrepRng(a); }, rBlock = /^(BODY|BLOCKQUOTE|D[DLT]|DIV|FORM|H\d|HR|LI|[OU]L|P|TABLE|T[RHD]|PRE|(BUTTON|INPUT|IMG|SELECT|TEXTAREA))$/, Cnms = { __proto__: N }, ChkNm = (obj, nm) => {
    let c = Cnms[nm], r;
    if (!c) {
        c = nm;
        if (!(nm in obj)) {
            r = new RegExp(`^${nm}$`, 'i');
            for (let p in obj)
                if (r.test(p)) {
                    c = p;
                    break;
                }
        }
        Cnms[nm] = c;
    }
    return c;
}, Abbr = (s, m = 65) => s.length > m ?
    s.slice(0, m - 3) + "..."
    : s, SetLVs = (vars, data) => vars.forEach((v, i) => v(data[i])), mapNm = (m, o) => m.set(o.nm, o), mapSet = (m, nm, v) => v != N ? m.set(nm, v) : m.delete(nm), ErrM = (elm, e = Q, maxL) => e + `\nat ${Abbr(/<[^]*?(?=>)/.exec(elm.outerHTML)[0], maxL)}>`, crErrN = (m) => ass(D.createElement('div'), { style: 'color:crimson;font-family:sans-serif;font-size:10pt',
    innerText: m }), NoChilds = (srcE) => {
    for (let n of srcE.childNodes)
        if (n.nodeType == 1
            || n.nodeType == 3
                && n.nodeValue.trim())
            throw `<${srcE.tagName} ...> must be followed by </${srcE.tagName}>`;
}, S2Hash = () => L.hash && setTimeout((_ => D.getElementById(L.hash.slice(1))?.scrollIntoView()), 6), gRe = (ats) => ats.gB('reacting') || ats.gB('reactive');
function* mapI(I, f, c) {
    for (let x of I)
        if (!c || c(x))
            yield f(x);
}
function* split(s) {
    if (s)
        for (let v of s.split(','))
            yield v.trim();
}
export function range(from, count, step = 1) {
    if (count === U) {
        count = from;
        from = 0;
    }
    return (function* (f, c, s) {
        while (c--) {
            yield f;
            f += s;
        }
    })(Number(from), Number(count), Number(step));
}
export async function RFetch(input, init) {
    try {
        let rp = await fetch(input, init);
        if (!rp.ok)
            throw `Status ${rp.status} ${rp.statusText}`;
        return rp;
    }
    catch (e) {
        throw `${init?.method || 'GET'} ${input}: ` + e;
    }
}
const fmt = new Intl.DateTimeFormat('nl', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hour12: false }), reg1 = /(?<dd>0?(?<d>\d+))-(?<MM>0?(?<M>\d+))-(?<yyyy>2.(?<yy>..))\D+(?<HH>0?(?<H>\d+)):(?<mm>0?(?<m>\d+)):(?<ss>0?(?<s>\d+)),(?<fff>(?<ff>(?<f>.).).)/g, dNFM = {};
function gNumFM(f) {
    let m = /^([DFXN])(\d*)$/.exec(f.toUpperCase());
    if (!m)
        throw `Invalid number format '${f}'`;
    let p = m[2] ? parseInt(m[2]) : N, L = R.S.locale;
    switch (m[1]) {
        case 'D': return new Intl.NumberFormat(L, { minimumIntegerDigits: p ?? 1, maximumFractionDigits: 0, useGrouping: false });
        case 'F': return new Intl.NumberFormat(L, { minimumFractionDigits: p ?? 2, maximumFractionDigits: p ?? 2, useGrouping: false });
        case 'X': return { format(x) {
                let s = x.toString(16), l = s.length;
                return p > l ? '0'.repeat(p - l) + s : s;
            } };
    }
    return new Intl.NumberFormat(L, { minimumFractionDigits: p ?? 0, maximumFractionDigits: p ?? 2, useGrouping: true });
}
Date.prototype.format = function (f) {
    return fmt.format(this).replace(reg1, f.replace(/\\(.)|(\w)\2*/g, (m, a) => a || `$<${m}>`));
};
Number.prototype.format = function (f) { return (dNFM[f] || (dNFM[f] = gNumFM(f))).format(this); };
Boolean.prototype.format = function (f) {
    return f.split(':')?.[this ? 0 : 1];
};
function RFormat(x, f) {
    return x instanceof Date || /nu|bo/.test(typeof x) ? x.format(f)
        : x?.toString(f);
}
class DL extends RV {
    constructor() {
        super('docLocation', new URL(L.href));
        this.basepath = U;
        EL(W, 'popstate', _ => this.U.href = L.href);
        this.Subscribe(url => {
            url.href == L.href || history.pushState(N, N, url.href);
            S2Hash();
        });
        this.query = new Proxy(this, {
            get(rl, key) { return rl.V.searchParams.get(key); },
            set(rl, key, val) {
                if (val != rl.V.searchParams.get(key)) {
                    mapSet(rl.V.searchParams, key, val);
                    rl.SetDirty();
                }
                return T;
            }
        });
    }
    get subpath() { return dL.pathname.slice(this.basepath.length); }
    set subpath(s) { dL.pathname = this.basepath + s; }
    search(key, val) {
        let U = new URL(this.V);
        mapSet(U.searchParams, key, val);
        return U.href;
    }
    RVAR(key, df, nm = key) {
        let g = () => this.query[key], rv = RVAR(nm, Q, N, v => this.query[key] = v);
        this.Subscribe(_ => rv.V = g() ?? df, T, T);
        return rv;
    }
}
const dL = new Proxy(new DL, ProxH);
export const docLocation = dL, viewport = RVAR('viewport', visualViewport), reroute = (arg) => {
    if (typeof arg == 'object') {
        if (arg.ctrlKey)
            return;
        arg.preventDefault();
        arg = arg.currentTarget.href;
    }
    dL.V = new URL(arg, L.href);
};
viewport.onresize = viewport.onscroll = _ => viewport.SetDirty();
let _ur = import.meta.url, R;
if (G._ur) {
    alert(`OtoReact loaded twice,\nfrom: ${G._ur}\nand: ${_ur}`);
    throw Q;
}
ass(G, {
    RVAR, range, reroute, RFetch, DoUpdate, docLocation,
    debug: V('()=>{debugger}'),
    _ur
});
export async function RCompile(srcN, setts) {
    if (srcN.isConnected && !srcN.b)
        try {
            if (typeof setts == 'string')
                setts = TryV(`({${setts}})`, `settings '${setts}'`);
            srcN.b = T;
            let m = L.href.match(`^.*(${setts?.basePattern || '/'})`), C = new RComp(N, L.origin + (dL.basepath = m ? new URL(m[0]).pathname : Q), setts);
            await C.Compile(srcN);
            srcN.innerHTML = Q;
            for (let a of srcN.attributes)
                a.value = Q;
            AJ({ Ex: () => C.Build({
                    pN: srcN.parentElement,
                    srcN,
                    bfor: srcN
                }).then(S2Hash).finally(() => srcN.hidden = F)
            });
        }
        catch (e) {
            alert('OtoReact compile error: ' + Abbr(e, 1000));
        }
}
export async function DoUpdate() {
    if (Jobs.size && !env) {
        env = E;
        nodeCnt = 0;
        let u0 = upd;
        start = now();
        while (Jobs.size) {
            let J = Jobs;
            Jobs = new Set;
            if (upd++ - u0 > 25) {
                alert('Infinite react-loop');
                break;
            }
            for (let j of J)
                await j.Ex();
        }
        if (nodeCnt)
            R?.log(`Updated ${nodeCnt} nodes in ${(now() - start).toFixed(1)} ms`);
        env = U;
    }
    hUpd = N;
}
EL(W, 'pagehide', _ => chWins.forEach(w => w.close()));
setTimeout(_ => D.querySelectorAll('*[rhtml]')
    .forEach(src => RCompile(src, src.getAttribute('rhtml'))), 0);
