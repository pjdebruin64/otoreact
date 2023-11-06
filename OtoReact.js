const N = null, T = !0, F = !T, U = void 0, Q = '', E = [], G = self, W = window, D = document, L = location, US = "'use strict';", dflts = {
    bShowErrors: T,
    bAutoPointer: T,
    preformatted: E,
    storePrefix: "RVAR_",
    version: 1,
}, P = new DOMParser, Ev = eval, ass = Object.assign, now = () => performance.now(), thro = (err) => { throw err; }, K = x => () => x, dr = v => v instanceof RV ? v.V : v;
;
class Context {
    constructor(C, a) {
        ass(this, C || {
            d: 0, L: 0, M: 0, ct: Q,
            lvM: new Map, csM: new Map
        });
        if (a && C) {
            this.lvM = new Map(this.lvM);
            this.csM = new Map(this.csM);
        }
    }
    getV(k) {
        if (k) {
            let D = this.d;
            return (e = env) => {
                let { d, i } = k;
                for (; d < D; d++)
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
    max(C) {
        return ass(C.L > this.L ? C : this, {
            M: Math.min(this.M, C.M)
        });
    }
}
class Range {
    constructor(ar, n, text) {
        this.text = text;
        this.n = n;
        if (ar) {
            let { parR: p, prR: q } = ar;
            if (p && !p.n)
                this.parR = p;
            if (q)
                q.nx = this;
            else if (p)
                p.ch = this;
            ar.prR = this;
        }
    }
    toString() { return this.text || this.n?.nodeName; }
    get Fst() {
        if (this.parN == N) {
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
            p = r.parR;
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
            ch.erase(ch.parN ?? par);
            ch.aD?.call(ch.n || par);
            ch = ch.nx;
        }
    }
    async update() {
        let b, bR, parR;
        ({ env, oes, pn, b, bR, parR } = this.uInfo);
        if (this.upd != upd)
            await b({ r: this, parN: pn, parR }, bR);
    }
}
const PrepRng = (ar, srcE, text = Q, nWipe, res) => {
    let { parN, r } = ar, sub = { parN }, cr;
    if (cr = !r) {
        sub.srcN = ar.srcN;
        sub.bfor = ar.bfor;
        r = sub.parR = new Range(ar, N, srcE ? srcE.tagName + (text && ' ' + text) : text);
    }
    else {
        sub.r = r.ch || T;
        ar.r = r.nx || T;
        if (cr = nWipe && (nWipe > 1 || res != r.res)) {
            (sub.parR = r).erase(parN);
            sub.r = N;
            sub.bfor = r.Nxt;
        }
    }
    r.res = res;
    return { r, sub, cr };
}, PrepElm = (ar, tag) => {
    let r = ar.r, cr = !r;
    if (cr)
        r = new Range(ar, ar.srcN
            || ar.parN.insertBefore(D.createElement(tag), ar.bfor));
    else
        ar.r = r.nx || T;
    nodeCnt++;
    return {
        r,
        sub: {
            parN: pn = r.n,
            r: r.ch,
            bfor: N,
            parR: r
        },
        cr
    };
}, PrepData = (ar, data, bC) => {
    let r = ar.r;
    if (!r)
        r = new Range(ar, ar.parN.insertBefore(bC ? D.createComment(data) : D.createTextNode(data), ar.bfor));
    else {
        r.n.data = data;
        ar.r = r.nx || T;
    }
    nodeCnt++;
    return r;
};
class Signat {
    constructor(srcE, RC) {
        this.srcE = srcE;
        this.Pams = [];
        this.Slots = new Map();
        this.nm = srcE.tagName;
        for (let attr of srcE.attributes) {
            let [a, m, rp, dum, nm, on, q] = /^(#|@|(\.\.\.)|(_)|)((on)?.*?)(\?)?$/.exec(attr.name), v = attr.value;
            if (!dum) {
                if (this.RP)
                    throw `Rest parameter must be last`;
                if (!nm && !rp)
                    throw 'Empty parameter name';
                let pDf = v ? m ? RC.CExpr(v, a) : RC.CText(v, a)
                    : on && (() => dU);
                this.Pams.push({
                    mode: m,
                    nm,
                    rq: !(q || pDf || rp),
                    pDf: m == '@' ? () => RVAR(Q, pDf?.()) : pDf
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
    constructor(t) {
        this.$name = U;
        this._v = U;
        this.$imm = N;
        this.$subs = new Set();
        if (t instanceof Promise) {
            this._v = U;
            t.then(v => this.V = v, oes.e);
        }
        else
            this._v = t;
    }
    get V() {
        arAdd(this);
        return this._v;
    }
    set V(v) {
        if (v !== this._v) {
            this._v = v;
            this.SetDirty();
        }
    }
    Subscribe(s, bImm, cr) {
        if (s) {
            if (cr)
                s(this._v);
            (bImm ? this.$imm || (this.$imm = new Set) : this.$subs).add(s);
        }
        return this;
    }
    Unsubscribe(s) {
        this.$imm?.delete(s);
        this.$subs.delete(s);
    }
    $SR({ parR, parN }, b, r, bR = true) {
        r.uInfo || (r.uInfo = { b, env, oes, pn: parN, parR, bR });
        this.$subs.add(r);
        (r.rvars || (r.rvars = new Set)).add(this);
    }
    $UR(r) {
        this.$subs.delete(r);
        r.rvars.delete(this);
    }
    get Set() {
        return t => t instanceof Promise ?
            (this._v = U,
                t.then(v => this.V = v, oes.e))
            : (this.V = t);
    }
    get Clear() {
        return () => Jobs.has(this) || (this.V = U);
    }
    get U() {
        ro || this.SetDirty();
        return this._v;
    }
    set U(t) { this._v = t; this.SetDirty(); }
    SetDirty() {
        this.$imm?.forEach(s => s(this._v));
        this.$subs.size && AJ(this);
    }
    async Exec() {
        for (let subs of this.$subs)
            try {
                if (subs instanceof Range)
                    await subs.update();
                else
                    subs(this._v);
            }
            catch (e) {
                console.log(e = `ERROR: ` + Abbr(e, 1000));
                alert(e);
            }
    }
    valueOf() { return this.V?.valueOf() ?? Q; }
}
const ProxH = {
    get(rv, p) {
        return p in rv ? rv[p] : rv.V?.[p];
    },
    set(rv, p, v) {
        if (p in rv)
            rv[p] = v;
        else if (v != rv._v[p])
            rv.U[p] = v;
        return T;
    },
    deleteProperty(rv, p) { return delete rv.U[p]; },
    has(rv, p) {
        return p in rv || rv.V != N && p in rv._v;
    }
};
export function RVAR(nm, val, store, subs, storeNm, updTo) {
    if (store) {
        var sNm = storeNm || 'RVAR_' + nm, s = store.getItem(sNm);
        if (s)
            try {
                val = JSON.parse(s);
            }
            catch { }
    }
    let rv = new RV(val).Subscribe(subs, T);
    rv.$name = nm || storeNm;
    store &&
        rv.Subscribe(v => store.setItem(sNm, JSON.stringify(v ?? N)));
    updTo &&
        rv.Subscribe(() => updTo.SetDirty(), T);
    rv = new Proxy(rv, ProxH);
    if (nm)
        G[nm] = rv;
    return rv;
}
let env, pn, oes = { e: N, s: N }, arR, arA, arB, arVars, arAdd = (rv, bA) => arA && (arVars || (arVars = new Map)).set(rv, bA || arVars?.get(rv)), arChk = () => {
    if (arA && (arR || arVars)) {
        if (arR === T)
            throw 'arCheck!';
        arR || (arR = arA.prR);
        arVars?.forEach((bA, rv) => arR.uv?.delete(rv) || rv.$SR(arA, arB, arR, !bA));
        arR.uv?.forEach((_, rv) => rv.$UR(arR));
        arR.uv = arVars;
        arR.upd = upd;
    }
    arA = arVars = N;
}, Jobs = new Set(), hUpd, ro = F, upd = 0, nodeCnt = 0, start, chWins = new Set(), OMods = new Map(), NoTime = (prom) => {
    let t = now();
    return prom.finally(() => start += now() - t);
}, AJ = (job) => {
    Jobs.add(job);
    hUpd || (hUpd = setTimeout(DoUpdate, 1));
};
let evM = (M) => {
    let v = M.d();
    if (v instanceof RV && M.T)
        arAdd(v);
    return v;
};
class Hndlr {
    hndl(ev, ...r) {
        if (this.h)
            try {
                var { e, s } = this.oes, a = this.h.call(ev.currentTarget, ev, ...r);
                a === false && ev.preventDefault();
                a instanceof Promise
                    ? a.then(_ => s?.(ev), e)
                    : s?.(ev);
            }
            catch (er) {
                (e || thro)(er);
            }
    }
    setTarget(ev) {
        this.S(ev.currentTarget[this.c || (this.c = ChkNm(ev.currentTarget, this.nm))]);
    }
}
function ApplyMods(r, cr, ms, k = 0, xs) {
    ro = T;
    let e = r.n, cu = cr ? 1 : 2, hc = F, i = 0, H;
    try {
        for (let M of ms) {
            if (M.cu & cu) {
                let nm = M.nm, x = xs ? xs[i] : M.d();
                switch (M.mt) {
                    case 0:
                        e.setAttribute(nm, x);
                        break;
                    case 1:
                        if (x instanceof RV) {
                            if (M.T && x != r[k]) {
                                M.T.d = K(xs ? xs[i + 1] = x.Set : x.Set);
                                r[k] = x;
                            }
                            x = x.V;
                        }
                        if (M.isS ?? (M.isS = typeof e[M.c = ChkNm(e, nm == 'for' ? 'htmlFor'
                            : nm == 'valueasnumber' && e.type == 'number'
                                ? 'value'
                                : nm)] == 'string'))
                            x = x == N ? Q : x.toString();
                        if (x !== e[nm = M.c])
                            e[nm] = x;
                        break;
                    case 8:
                        if (cr) {
                            (H = r[k] = new Hndlr).oes = oes;
                            e.addEventListener(M.ev, H.setTarget.bind(H));
                            H.nm = nm;
                        }
                        else
                            H = r[k];
                        H.S = x;
                        break;
                    case 7:
                        if (cr) {
                            (H = r[k] = new Hndlr).oes = oes;
                            e.addEventListener(nm, H.hndl.bind(H));
                        }
                        else
                            H = r[k];
                        H.h = x;
                        if (M.ap)
                            e.style.cursor = (hc || (hc = x && !e.disabled)) ? 'pointer' : Q;
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
                        e[nm] = x.replace(/(.+?)(,|$)/gs, (_, u, r) => new URL(u, M.fp).href + r);
                        break;
                    case 5:
                        ass(e, x);
                        break;
                    case 3:
                        let p = r[k], n = M.cu & 2 ? (r[k] = new Set()) : N;
                        function AC(C) {
                            if (C) {
                                p?.delete(C)
                                    || e.classList.add(C);
                                n?.add(C);
                            }
                        }
                        if (x)
                            switch (typeof x) {
                                case 'string':
                                    x.split(/\s+/).forEach(AC);
                                    break;
                                case 'object':
                                    if (Array.isArray(x))
                                        x.forEach(AC);
                                    else
                                        for (let [nm, b] of Object.entries(x))
                                            b && AC(nm);
                                    break;
                                default: throw `Invalid value`;
                            }
                        if (p)
                            for (let v of p)
                                e.classList.remove(v);
                        break;
                    case 9:
                        if (x)
                            k = ApplyMods(r, cr, x.ms, k, x.xs);
                        break;
                    case 10:
                        x.call(e);
                        break;
                    case 11:
                        if (!e.download
                            && !e.target
                            && e.href.startsWith(L.origin + rvu.basepath))
                            e.addEventListener('click', reroute);
                }
            }
            i++;
            k++;
        }
    }
    finally {
        ro = F;
    }
    return k;
}
let iRC = 0, iLS = 0;
class RComp {
    constructor(RC, FP, settings, CT = RC?.CT) {
        this.num = iRC++;
        this.rActs = [];
        this.sPRE = new Set(['PRE']);
        this.ws = 1;
        this.rt = T;
        this.S = { ...RC ? RC.S : dflts, ...settings };
        this.fp = FP || RC?.fp;
        this.doc = RC?.doc || D;
        this.hd = RC?.hd || this.doc.head;
        this.CT = new Context(CT, T);
        this.lscl = RC?.lscl || E;
        this.ndcl = RC?.ndcl || 0;
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
            return { sub, EF: () => { env = e; } };
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
                Ev(`let ${nm}=0`);
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
    async Build(ar) {
        R = this;
        env = [];
        try {
            await this.bldr(ar);
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
                        bl = async (ar) => {
                            arA && arChk();
                            arVars = N;
                            arR = ar.r;
                            arB = bl;
                            PrepData(arA = ar, getText(), bC);
                            arA && arChk();
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
                : async function Iter(ar) {
                    for (let b of bs)
                        await b(ar);
                }
            : N;
    }
    async CElm(srcE, bUH) {
        try {
            let tag = srcE.tagName, ats = new Atts(srcE), ga = [], bf = [], af = [], bl, bA, constr = this.CT.getCS(tag), b, m, nm;
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
                                    ? this.CHandlr(ats.g(at), at)
                                    : m[8]
                                        ? this.CAttExp(ats, at)
                                        :
                                            this.CAttExps(ats, at)
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
                                h: m[9] && this.CHandlr(txt, at)
                            });
                        if (/m/.test(at))
                            Ev(`(function(){${txt}\n})`).call(srcE);
                    }
            if (constr)
                bl = await this.CInst(srcE, ats, constr);
            else
                switch (tag) {
                    case 'DEF':
                    case 'DEFINE':
                        {
                            NoChilds(srcE);
                            let rv = ats.g('rvar'), t = '@value', twv = rv && ats.g(t), bU = ats.gB('reacting') || ats.gB('updating') || twv, dGet = twv ? this.CExpr(twv, t) : this.CPam(ats, 'value'), dSet = twv && this.CTarget(twv), dUpd = rv && this.CAttExp(ats, 'updates'), dSto = rv && this.CAttExp(ats, 'store'), dSNm = dSto && this.CPam(ats, 'storename'), vLet = this.LV(rv || ats.g('let') || ats.g('var', T)), vGet = rv && this.CT.getLV(rv), onMod = rv && this.CPam(ats, 'onmodified');
                            bA = async function DEF(ar, bR) {
                                let { cr } = PrepRng(ar, srcE), v;
                                if (bU || (arA = N) || cr || bR != N) {
                                    try {
                                        ro = T;
                                        v = dGet?.();
                                    }
                                    finally {
                                        ro = F;
                                    }
                                    if (rv)
                                        if (cr)
                                            vLet(RVAR(N, v, dSto?.(), dSet?.(), dSNm?.() || rv, dUpd?.()))
                                                .Subscribe(onMod?.());
                                        else
                                            vGet().Set(v);
                                    else
                                        vLet(v);
                                }
                            };
                        }
                        break;
                    case 'IF':
                    case 'CASE':
                        bl = await this.CCase(srcE, ats);
                        break;
                    case 'FOR':
                        bl = await this.CFor(srcE, ats);
                        break;
                    case 'MODULE':
                        ats.g('id');
                        break;
                    case 'INCLUDE':
                        bl = await this.CIncl(srcE, ats, T);
                        break;
                    case 'IMPORT':
                        {
                            let src = ats.g('src', T), bIncl = ats.gB('include'), bAsync = ats.gB('async'), lvars = this.LVars(ats.g('defines')), imps = Array.from(mapI(srcE.children, ch => new Signat(ch, this))), DC = this.LCons(imps), cTask = OMods.get(src);
                            if (!cTask) {
                                let C = new RComp(this, this.GetP(src), { bSubf: T }, new Context);
                                C.log(src);
                                cTask =
                                    this.fetchM(src)
                                        .then(iter => C.Compile(N, iter))
                                        .then(b => [b, C.CT]);
                                if (this.S.bSubf != 2)
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
                            bA = async function IMPORT(ar) {
                                let { sub, cr, r } = PrepRng(ar, srcE);
                                arA = N;
                                if (cr || bIncl) {
                                    try {
                                        var b = await NoTime(task), s = env, MEnv = env = r.v || (r.v = []);
                                        await b(bIncl ? sub : { parN: D.createDocumentFragment() });
                                    }
                                    finally {
                                        env = s;
                                    }
                                    DC(mapI(imps, S => S.g(MEnv)));
                                    for (let lv of lvars)
                                        lv(lv.g(MEnv));
                                }
                            };
                        }
                        break;
                    case 'REACT':
                        b = await this.CChilds(srcE);
                        bl = b && function (ar, bR) {
                            return !(ar.r && bR) && b(ar);
                        };
                        break;
                    case 'RHTML':
                        {
                            let { ws, rt } = this, b = await this.CUncN(srcE), dSrc = !b && this.CPam(ats, 'srctext'), dO = this.CPam(ats, "onç"), s = { bSubf: 2, bTiming: this.S.bTiming };
                            bl = async function RHTML(ar) {
                                let { r, sub } = PrepElm(ar, 'r-html'), src = b ? (await b(sub)).innerText : dSrc?.();
                                if (src != r.src) {
                                    let sv = env, C = ass(new RComp(N, L.origin + rvu.basepath, s), { ws, rt }), parN = C.hd = r.n.shadowRoot || r.n.attachShadow({ mode: 'open' }), parR = r.pR || (r.pR = new Range(N, N, tag)), tmp = D.createElement(tag);
                                    (C.doc = D.createDocumentFragment()).appendChild(tmp);
                                    parR.erase(parN);
                                    parN.innerHTML = Q;
                                    try {
                                        tmp.innerHTML = r.src = src;
                                        await C.Compile(tmp, tmp.childNodes);
                                        dO && dO()(U);
                                        await C.Build({ parN, parR });
                                    }
                                    catch (e) {
                                        parN.appendChild(crErrN(e));
                                    }
                                    finally {
                                        env = sv;
                                    }
                                }
                                pn = ar.parN;
                            };
                        }
                        break;
                    case 'SCRIPT':
                        bA = await this.CScript(srcE, ats);
                        break;
                    case 'COMPONENT':
                        bA = await this.CComp(srcE, ats);
                        break;
                    case 'DOCUMENT':
                        {
                            let vNm = this.LV(ats.g('name', T)), bEncaps = ats.gB('encapsulate'), PC = this, RC = new RComp(this), vPams = RC.LVars(ats.g('params')), vWin = RC.LV(ats.g('window', F, F, T)), H = RC.hd = D.createDocumentFragment(), b = await RC.CChilds(srcE);
                            bA = async function DOCUMENT(ar) {
                                if (PrepRng(ar).cr) {
                                    let { doc, hd } = PC, docEnv = env, wins = new Set();
                                    vNm({
                                        async render(w, cr, args) {
                                            let s = env, Cdoc = RC.doc = w.document;
                                            RC.hd = Cdoc.head;
                                            env = docEnv;
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
                                                await b({ parN: Cdoc.body });
                                            }
                                            finally {
                                                env = s;
                                            }
                                        },
                                        open(target, features, ...args) {
                                            let w = W.open(Q, target || Q, features), cr = !chWins.has(w);
                                            if (cr) {
                                                w.addEventListener('keydown', (event) => { if (event.key == 'Escape')
                                                    w.close(); });
                                                w.addEventListener('close', () => chWins.delete(w), wins.delete(w));
                                                chWins.add(w);
                                                wins.add(w);
                                            }
                                            w.document.body.innerHTML = Q;
                                            this.render(w, cr, args);
                                            return w;
                                        },
                                        async print(...args) {
                                            let f = doc.createElement('iframe');
                                            f.hidden = T;
                                            doc.body.appendChild(f);
                                            await this.render(f.contentWindow, T, args);
                                            f.contentWindow.print();
                                            f.remove();
                                        },
                                        closeAll: () => wins.forEach(w => w.close())
                                    });
                                }
                            };
                        }
                        break;
                    case 'RHEAD':
                        let { ws } = this;
                        this.ws = this.rt = 1;
                        b = await this.CChilds(srcE);
                        this.ws = ws;
                        bl = b && (async (ar) => {
                            let { parN, bfor } = ar, p;
                            try {
                                await b(ass(ar, { parN: this.hd, bfor: N }));
                            }
                            finally {
                                if (p = ar.prR)
                                    p.parN = ar.parN;
                                ass(ar, { parN, bfor });
                            }
                        });
                        break;
                    case 'STYLE':
                        {
                            let src = ats.g('src'), sc = ats.g('scope'), nm, { lscl: l, hd } = this;
                            if (sc) {
                                /^local$/i.test(sc) || thro('Invalid scope');
                                nm = `\uFFFE${iLS++}`;
                                this.lscl = [...l, nm];
                                this.rActs.push(() => this.lscl = l);
                            }
                            (src ? this.FetchText(src) : Promise.resolve(srcE.innerText))
                                .then(txt => {
                                if (src || nm)
                                    srcE.innerHTML = AddC(txt, nm);
                                hd.appendChild(srcE);
                            });
                            ats.clear();
                        }
                        break;
                    case 'RSTYLE': {
                        let s = [this.S.bDollarRequired, this.rIS, this.ws], sc = ats.g('scope'), { bf, af } = this.CAtts(ats), i;
                        try {
                            this.S.bDollarRequired = T;
                            this.rIS = N;
                            this.ws = 1;
                            let b = await (sc ?
                                (/^local$/i.test(sc) || thro('Invalid scope')
                                    , (i = this.ndcl++)
                                    , this.rActs.push(() => this.ndcl--)
                                    , this.CUncN(srcE, ats))
                                : this.CIncl(srcE, ats));
                            bl = b && async function RSTYLE(ar) {
                                let { r, cr, sub } = PrepElm(ar, 'STYLE'), k = ApplyMods(r, cr, bf);
                                if (sc) {
                                    let txt = (await b(ar)).innerText, nm = r.cn || (r.cn = `\uFFFE${iLS++}`);
                                    if (txt != r.tx)
                                        r.n.innerHTML = AddC(r.tx = txt, nm);
                                    (env.cl = r.cl || (r.cl = [...env.cl || E]))[i] = nm;
                                }
                                else
                                    await b(sub);
                                ApplyMods(r, cr, af, k);
                                pn = ar.parN;
                            };
                        }
                        finally {
                            [this.S.bDollarRequired, this.rIS, this.ws] = s;
                        }
                        break;
                    }
                    case 'ELEMENT':
                        bl = await this.CHTML(srcE, ats, this.CPam(ats, 'tagname', T));
                        this.ws = 3;
                        break;
                    case 'ATTRIBUTE':
                        NoChilds(srcE);
                        let dN = this.CPam(ats, 'name', T), dV = this.CPam(ats, 'value', T);
                        bl = async function ATTRIB(ar) {
                            let r = PrepRng(ar, srcE).r, n0 = r.v, nm = r.v = dN();
                            if (n0 && nm != n0)
                                pn.removeAttribute(n0);
                            if (nm)
                                pn.setAttribute(nm, dV());
                        };
                        break;
                    case 'COMMENT':
                        {
                            let { ws } = this, b = (this.rt = F, this.ws = 4,
                                await this.CUncN(srcE));
                            bl = async function COMMENT(ar) {
                                PrepData(ar, (await b(ar)).innerText, T);
                            };
                            this.ws = ws;
                        }
                        break;
                    default:
                        bl = await this.CHTML(srcE, ats, U, bUH);
                }
            if (!bUH)
                ats.None();
            nm = (bl || (bl = bA || (bA = dB))).name;
            if (bf.length || af.length) {
                for (let g of af)
                    g.h = this.CHandlr(g.txt, g.at);
                let b = bl;
                bl = async function Pseu(ar, bR) {
                    let { r, sub, cr } = PrepRng(ar, srcE), sr = sub.r || T, bD = ph(bf, 'bU', sr != T && sr.n || pn);
                    await b(sub, bR);
                    let rng = cr
                        ? sub.prR
                        : sr, aD = ph(af, 'aU', rng.n || pn);
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
            for (let { at, m, dV } of this.S.version ? ga : ga.reverse()) {
                let b = bl, es = m[6] ? 'e' : 's', bA = !m[3];
                if (m[2]) {
                    b = this.ErrH(b, srcE);
                    bl = function on(ar, bR) {
                        for (let rv of dV())
                            if (rv) {
                                if (!rv.$SR)
                                    throw `This is not an RVAR\nat '${at}'`;
                                arAdd(rv, bA);
                            }
                        ar = PrepRng(ar, srcE).sub;
                        return b(ar, bR);
                    };
                }
                else
                    bl =
                        m[5]
                            ? async function SetOnES(ar, bR) {
                                let s = oes, { sub, r } = PrepRng(ar, srcE, at);
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
                                ? function HASH(ar, bR) {
                                    let { sub, r, cr } = PrepRng(ar, srcE, at), ph = r.v;
                                    r.v = dV();
                                    if (cr || r.v.some((hash, i) => hash !== ph[i]))
                                        return b(sub, bR);
                                }
                                : m[8]
                                    ? function hIf(ar, bR) {
                                        let c = dV(), p = PrepRng(ar, srcE, at, 1, !c);
                                        if (c)
                                            return b(p.sub, bR);
                                    }
                                    :
                                        function renew(sub, bR) {
                                            return b(PrepRng(sub, srcE, at, 2).sub, bR);
                                        };
            }
            return bl != dB && ass(this.ErrH(bl, srcE, !!bA), { nm });
        }
        catch (m) {
            throw ErrM(srcE, m);
        }
    }
    ErrH(b, srcN, bA) {
        let bl = b && (async (ar, bR) => {
            let r = ar.r;
            if (r?.eN) {
                pn.removeChild(r.eN);
                r.eN = U;
            }
            try {
                arA && arChk();
                arVars = N;
                arR = ar.r;
                arB = bl;
                let prom = b(arA = ar, bR);
                arA && arChk();
                await prom;
            }
            catch (m) {
                if (m) {
                    let msg = srcN instanceof HTMLElement ? ErrM(srcN, m, 45) : m, e = oes.e;
                    if (this.S.bAbortOnError)
                        throw msg;
                    this.log(msg);
                    e ? e(m)
                        : this.S.bShowErrors ?
                            (r || {}).eN = ar.parN.insertBefore(crErrN(msg), ar.r?.FstOrNxt)
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
                let C = new RComp(this, this.GetP(src), { bSubf: T }), task = srcE.children.length || srcE.textContent.trim()
                    ? C.Compile(N, cn)
                    : this.fetchM(src).then(cn => C.Compile(N, cn));
                return async function INCL(ar) {
                    PrepRng(ar, srcE);
                    arChk();
                    let { sub, EF } = SF(ar);
                    await (await NoTime(task))(sub).finally(EF);
                };
            })
            : this.CChilds(srcE, cn);
    }
    async CUncN(srcE, ats) {
        let b = await this.CIncl(srcE, ats);
        return b && (async (ar) => {
            let { r, sub } = PrepRng(ar, srcE), p = sub.parN = r.p || (r.p = D.createElement(srcE.tagName));
            r.parN = F;
            sub.bfor = N;
            await b(sub);
            return p;
        });
    }
    async CScript(srcE, ats) {
        let { type, text, defer, async } = srcE, src = ats.g('src'), defs = ats.g('defines') || '', m = /^\s*(((text|application)\/javascript|(module)|)|(otoreact)(\/(((local)|static)|global)|(.*?)))\s*(;\s*type\s*=\s*(")?module\12)?\s*$|/i.exec(type), bU = ats.gB('updating'), { ct } = this.CT, lvars = m[8] && this.LVars(defs), ex;
        ats.clear();
        if (m[5] && (!m[10] || thro("Invalid script type"))
            || m[2] != N && this.S.bSubf) {
            if (m[9]) {
                let prom = (async () => Ev(US + `(function([${ct}]){{\n${src ? await this.FetchText(src) : text}\nreturn{${defs}}}})`))();
                ex = async () => (await prom)(env);
            }
            else if (m[4] || m[11])
                ex = K(src
                    ? import(this.gURL(src))
                    : import(src = URL.createObjectURL(new Blob([text.replace(/\/\/.*|\/\*[^]*?\*\/|(['"`])(?:\\.|[^])*?\1|(\bimport\b(?:(?:[a-zA-Z0-9_,*{}]|\s)*\bfrom)?\s*(['"]))(.*?)\3/g, (p0, _, p2, p3, p4) => p2 ? p2 + this.gURL(p4) + p3 : p0)], { type: 'text/javascript' }))).finally(() => URL.revokeObjectURL(src)));
            else {
                let pTxt = (async () => `${m[5] ? US : Q}${src ? await this.FetchText(src) : text}\n;({${defs}})`)(), V;
                ex = async () => V || (V = Ev(await pTxt));
                if (src && async)
                    ex();
                else if (!m[5] && !defer)
                    await ex();
            }
            return async function SCRIPT(ar) {
                PrepRng(ar, srcE);
                bU || arChk();
                if (!ar.r || bU) {
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
        let aList = [], { ws, rt, CT } = this, postCT = CT, postWs = 0;
        for (let { n, ats, body } of cases) {
            let ES = ass(this, { ws, rt, CT: new Context(CT) })
                .SS();
            try {
                let cond, not = F, patt, p;
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
                        postWs = Math.max(postWs, this.ws);
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
        this.ws = !bE && ws > postWs ? ws : postWs;
        this.CT = postCT;
        return aList.length && async function CASE(ar, bR) {
            let val = dV?.(), RRE, cAlt;
            try {
                for (var alt of aList)
                    if (!((!alt.cond || alt.cond())
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
                        let { r, sub, cr } = PrepElm(ar, 'WHEN');
                        if (!(r.n.hidden = alt != cAlt) && !bR
                            || cr)
                            await alt.b(sub);
                    }
                    pn = ar.parN;
                }
                else {
                    let { sub, cr } = PrepRng(ar, srcE, Q, 1, cAlt);
                    if (cAlt && (cr || !bR)) {
                        if (RRE)
                            RRE.shift(),
                                SetLVs(cAlt.patt.lvars, cAlt.patt.url ? RRE.map(decodeURIComponent) : RRE);
                        await cAlt.b(sub);
                    }
                }
            }
        };
    }
    CFor(srcE, ats) {
        let letNm = ats.g('let'), ixNm = ats.g('index', F, F, T), rixNm = ats.g('rindex', F, F, T);
        this.rt = F;
        if (letNm != N) {
            let dOf = this.CAttExp(ats, 'of', T), pvNm = ats.g('previous', F, F, T), nxNm = ats.g('next', F, F, T), dUpd = this.CAttExp(ats, 'updates'), bRe = ats.gB('reacting') || ats.gB('reactive') || dUpd;
            return this.Framed(async (SF) => {
                let vLet = this.LV(letNm), vIx = this.LV(ixNm), vRix = this.LV(rixNm), vPv = this.LV(pvNm), vNx = this.LV(nxNm), dKey = this.CAttExp(ats, 'key'), dHash = this.CAttExps(ats, 'hash'), b = await this.CIter(srcE.childNodes);
                return b && async function FOR(ar) {
                    let iter = dr(dOf()) || E, { r, sub } = PrepRng(ar, srcE, Q), { parN } = sub, bfor = sub.bfor !== U ? sub.bfor : r.Nxt, sEnv = { env, oes }, pIter = async (iter) => {
                        ({ env, oes } = sEnv);
                        if (!(Symbol.iterator in iter || Symbol.asyncIterator in iter))
                            throw `[of] Value (${iter}) is not iterable`;
                        let kMap = r.v || (r.v = new Map), nMap = new Map(), ix = 0, { EF } = SF(N, {});
                        try {
                            for await (let item of iter) {
                                vLet(item);
                                vIx(ix);
                                let hash = dHash?.(), key = dKey?.() ?? hash?.[0];
                                if (key != N && nMap.has(key))
                                    throw `Duplicate key '${key}'`;
                                nMap.set(key ?? {}, { item, key, hash, ix: ix++ });
                            }
                        }
                        finally {
                            EF();
                        }
                        let L = nMap.size, x, nxR = r.ch, bf, iter2 = nMap.values(), nxIR = iter2.next(), prIt, prR, k, EC = () => {
                            while (nxR && !nMap.has(k = nxR.key)) {
                                if (k != N)
                                    kMap.delete(k);
                                nxR.erase(parN);
                                if (nxR.rv)
                                    nxR.rv.$subs.delete(nxR);
                                nxR.pv = N;
                                nxR = nxR.nx;
                            }
                            bf = nxR?.FstOrNxt || bfor;
                        };
                        sub.parR = r;
                        while (!nxIR.done) {
                            EC();
                            let { item, key, hash, ix } = nxIR.value, chR = kMap.get(key), cr = !chR, chAr;
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
                                        if ((x = nMap.get(nxR.key).ix - ix) * x > L) {
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
                                        parN.insertBefore(n, bf);
                                    chR.mov = F;
                                    chR.nx = nxR;
                                    break;
                                }
                                nxR = chR.nx;
                                sub.r = chR;
                                chAr = PrepRng(sub).sub;
                                sub.parR = N;
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
                                vIx(ix);
                                if (rixNm)
                                    vRix(chR.ix || (chR.ix = new RV)).V = ix;
                                if (bRe)
                                    if (rv)
                                        vLet(rv)._v = item;
                                    else
                                        vLet(chR.rv = RVAR(N, item, N, N, N, dUpd?.()));
                                else
                                    vLet(item);
                                vPv(prIt);
                                vNx(nxIR.value?.item);
                                if (cr || !hash || hash.some((h, i) => h != chR.hash[i]))
                                    if (rv)
                                        AJ(rv);
                                    else {
                                        await b(iSub);
                                        chR.rv?.$SR(iSub, b, chR.ch);
                                    }
                            }
                            finally {
                                EF();
                            }
                            chR.hash = hash;
                            prIt = item;
                        }
                        EC();
                        if (prR)
                            prR.nx = N;
                        else
                            r.ch = N;
                    };
                    arChk();
                    if (iter instanceof Promise)
                        iter.then(it => AJ({ Exec: () => pIter(it) }), sEnv.oes.e);
                    else
                        await pIter(iter);
                };
            });
        }
        else {
            let nm = ats.g('of', T, T).toUpperCase(), { S, dC } = this.CT.getCS(nm) ||
                thro(`Missing attribute [let]`);
            return this.Framed(async (SF) => {
                let vIx = this.LV(ixNm), DC = this.LCons([S]), b = await this.CChilds(srcE);
                return b && async function FOREACH_Slot(ar) {
                    let { tmps, env } = dC(), { EF, sub } = SF(ar), i = 0;
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
        return async function COMP(ar) {
            DC(CDefs.map(C => ({ ...C, env })));
            await b(ar);
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
            return b && async function TEMPL(args, mSlots, env, ar) {
                if (!ar.r)
                    for (let { nm, pDf } of S.Pams)
                        if (pDf && args[nm] === U)
                            args[nm] = pDf();
                ro = F;
                let { sub, EF } = SF(ar);
                for (let [nm, lv] of lvars)
                    lv(args[nm]);
                DC(mapI(S.Slots.keys(), nm => ({ nm,
                    tmps: mSlots.get(nm) || E,
                    env
                })));
                if (eStyles) {
                    let { r: { n }, sub: s, cr } = PrepElm(sub, /^[A-Z].*-/.test(S.nm) ? S.nm : 'RHTML-' + S.nm), SR = s.parN = n.shadowRoot || n.attachShadow({ mode: 'open' });
                    if (cr)
                        for (let sn of eStyles)
                            SR.appendChild(sn.cloneNode(T));
                    sub = s;
                }
                await b(sub).finally(EF);
                pn = ar.parN;
            };
        }).catch(m => { throw `<${S.nm}> template: ` + m; });
    }
    async CInst(srcE, ats, { S, dC }) {
        await S.task;
        let { RP, CSlot, Slots } = S, gArgs = [], SBldrs = new Map(mapI(Slots, ([nm]) => [nm, []]));
        for (let { mode, nm, rq } of S.Pams)
            if (nm != RP) {
                let dG, dS;
                if (mode == '@') {
                    let ex = ats.g(mode + nm, rq);
                    dG = this.CExpr(ex, mode + nm);
                    dS = this.CTarget(ex);
                }
                else
                    dG = this.CPam(ats, nm, rq);
                if (dG)
                    gArgs.push({ nm, dG, dS });
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
            let { bf, af } = this.CAtts(ats);
            bf.push(...af);
            ro = T;
            gArgs.push({
                nm: RP,
                dG: () => ({ ms: bf, xs: bf.map(evM) })
            });
            ro = F;
        }
        this.ws = 3;
        return async function INST(ar) {
            let { r, sub } = PrepRng(ar, srcE), sEnv = env, cdef = dC(), args = r.args || (r.args = { __proto__: N });
            if (cdef)
                try {
                    ro = T;
                    for (let { nm, dG, dS } of gArgs) {
                        let v = dG();
                        if (dS)
                            (args[nm] || (args[nm] = RVAR(U, U, U, v instanceof RV ? v.Set : dS())))._v = dr(v);
                        else
                            args[nm] = v;
                    }
                    arChk();
                    env = cdef.env;
                    for (let tmpl of cdef.tmps)
                        await tmpl?.(args, SBldrs, sEnv, sub);
                }
                finally {
                    env = sEnv;
                    ro = F;
                }
        };
    }
    async CHTML(srcE, ats, dTag, bUH) {
        let nm = dTag ? N : srcE.tagName.replace(/\.+$/, Q), preWs = this.ws, postWs;
        if (this.sPRE.has(nm) || /^.re/.test(srcE.style.whiteSpace)) {
            this.ws = 4;
            postWs = 1;
        }
        else if (rBlock.test(nm))
            this.ws = this.rt = postWs = 1;
        else if (rInline.test(nm)) {
            this.ws = this.rt = 1;
            postWs = 3;
        }
        if (preWs == 4)
            postWs = preWs;
        let { bf, af } = this.CAtts(ats), b = await this.CChilds(srcE), { lscl, ndcl } = this;
        if (postWs)
            this.ws = postWs;
        if (nm == 'A' && this.S.bAutoReroute && bf.every(({ nm }) => nm != 'click'))
            af.push({ mt: 11, d: dU, cu: 1 });
        if (bUH)
            af.push({ mt: 1, nm: 'hidden', d: dU, cu: 1 });
        bf.length || (bf = U);
        af.length || (af = U);
        return async function ELM(ar, bR) {
            let { r, sub, cr } = PrepElm(ar, nm || dTag()), k = bf && ApplyMods(r, cr, bf), xs = (ro = af)?.map(evM);
            ro = F;
            if (cr) {
                for (let nm of lscl)
                    r.n.classList.add(nm);
                for (let i = 0; i < ndcl; i++)
                    r.n.classList.add(env.cl[i]);
            }
            if (cr || !bR)
                await b?.(sub);
            af && ApplyMods(r, cr, af, k, xs);
            pn = ar.parN;
        };
    }
    CAtts(ats) {
        let bf = [], af = [], m, ap = this.S.bAutoPointer, addM = (mt, nm, d, cu, ev) => {
            let M = { mt, nm, d,
                cu: cu ||
                    (d.fx != N ? 1 : 3),
                ev
            };
            if (ap && mt == 7)
                M.ap = nm == 'click';
            if (mt == 6)
                M.fp = this.fp;
            (mt >= 9 || nm == 'value' && ats.elm.tagName == 'SELECT' ? af : bf).push(M);
            return M;
        };
        for (let [A, V] of ats)
            if (m = /^(?:(([#+.](#)?)?(((class|classname)|style)(?:[.:](\w+))?|on(\w+)\.*|(src|srcset)|(\w*)\.*))|([\*\+#!]+|@@?)(\w*)|\.\.\.(\w+))$/.exec(A)) {
                let [, o, p, h, d, y, c, i, e, s, a, t, k, r] = m;
                if (o) {
                    let dV = p ? this.CExpr(V, A)
                        : e ? this.CHandlr(V, A)
                            : this.CText(V, A);
                    addM(c ? 3
                        : y ? i ? 2 : 4
                            : e ? 7
                                : s ? 6
                                    : p ? d ? 1 : 5
                                        : 0, a || e || i || d, i && c
                        ? () => Object.fromEntries([[i, dV()]])
                        : dV, (e && !p || h) && 1);
                }
                else if (t) {
                    let cu, dS = this.CTarget(V), cnm, M = (m = /[@#](#)?/.exec(t))
                        ? addM(1, k, this.CExpr(V, k), m[1] && 1)
                        : {};
                    if (m = /([@!])(\1)?/.exec(t))
                        M.T = addM(8, k, dS, 3, m[2] ? 'change' : 'input');
                    if (cu = /\*/.test(t) + /\+/.test(t) * 2)
                        addM(10, k, () => {
                            let S = dS();
                            return k ?
                                function () { S(this[cnm || (cnm = ChkNm(this, k))]); }
                                : function () { S(this); };
                        }, cu);
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
        let f = (re) => `(?:\\{(?:\\{${re}\\}|[^])*?\\}\
|'(?:\\\\.|[^])*?'\
|"(?:\\\\.|[^])*?"\
|\`(?:\\\\[^]|\\\$\\{${re}}|[^])*?\`\
|/(?:\\\\.|\[]?(?:\\\\.|.)*?\])*?/\
|[^])*?`, rIS = this.rIS || (this.rIS = new RegExp(`\\\\([{}])|\\$${this.S.bDollarRequired ? Q : '?'}\\{\\s*(${f(f(f('[^]*?')))})\\}|$`, 'g')), gens = [], ws = nm || this.S.bKeepWhiteSpace ? 4 : this.ws, fx = Q, iT = T;
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
                                s += typeof g == 'string' ? g : g() ?? Q;
                            return s;
                        };
                gens.push(this.CExpr(m[2], nm, U, '{}'));
                iT = fx = Q;
            }
        }
    }
    CPatt(patt, url) {
        let reg = Q, lvars = [], rP = /\\[{}]|\{((?:[^}]|\\\})*)\}|\?|\*|(\\[^])|\[\^?(?:\\[^]|[^\\\]])*\]|$/g;
        while (rP.lastIndex < patt.length) {
            let ix = rP.lastIndex, m = rP.exec(patt), lits = patt.slice(ix, m.index);
            reg +=
                lits.replace(/\W/g, s => '\\' + s)
                    + (m[1] != N
                        ? (lvars.push(this.LV(m[1])), '(.*?)')
                        : m[0] == '?' ? '.'
                            : m[0] == '*' ? '.*'
                                : m[2] ? m[2]
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
    CTarget(LHS) {
        return this.CRout(`(${LHS})=$`, '$', `\nin assigment target "${LHS}"`);
    }
    CHandlr(txt, nm) {
        return /^#/.test(nm) ?
            this.CExpr(txt, nm, txt)
            : this.CRout(txt, 'event', `\nat ${nm}="${Abbr(txt)}"`);
    }
    CRout(txt, x, E) {
        try {
            let ct = this.gsc(txt), C = Ev(`${US}(function(${x},${ct}){${txt}\n})`);
            return ct ?
                (e = env) => function ($) {
                    try {
                        return C.call(this, $, e);
                    }
                    catch (m) {
                        throw m + E;
                    }
                }
                : () => function ($) {
                    try {
                        return C.call(this, $);
                    }
                    catch (m) {
                        throw m + E;
                    }
                };
        }
        catch (m) {
            throw m + E;
        }
    }
    CExpr(e, nm, src = e, dl = '""') {
        if (e == N)
            return e;
        e.trim() || thro(`${nm}: Empty expression`);
        try {
            var E = '\nat ' + (nm ? `${nm}=` : Q) + dl[0] + Abbr(src) + dl[1], f = Ev(`${US}(function(${this.gsc(e)}){return(${e}\n)})`);
            return () => {
                try {
                    return f.call(pn, env);
                }
                catch (m) {
                    throw m + E;
                }
            };
        }
        catch (m) {
            throw m + E;
        }
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
    GetP(src) {
        return this.gURL(src).replace(/[^/]*$/, Q);
    }
    async FetchText(src) {
        return (await RFetch(this.gURL(src), { headers: this.S.headers })).text();
    }
    async fetchM(src) {
        let m = this.doc.getElementById(src);
        if (!m) {
            let { head, body } = P.parseFromString(await this.FetchText(src), 'text/html'), e = body.firstElementChild;
            if (e?.tagName != 'MODULE')
                return [...head.childNodes, ...body.childNodes];
            m = e;
        }
        else if (m.tagName != 'MODULE')
            throw `'${src}' must be a <MODULE>`;
        return m.childNodes;
    }
}
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
            return v == N ? Ev(super.get(m = '%' + nm)) : v;
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
const dU = _ => U, dB = async (ar) => { PrepRng(ar); }, rBlock = /^(BODY|BLOCKQUOTE|D[DLT]|DIV|FORM|H\d|HR|LI|[OU]L|P|TABLE|T[RHD]|PRE)$/, rInline = /^(BUTTON|INPUT|IMG|SELECT|TEXTAREA)$/, AddC = (txt, nm) => nm ? txt.replaceAll(/{(?:{.*?}|.)*?}|@[msd].*?{|@[^{;]*|(?:\w*\|)?(\w|[-.#:()\u00A0-\uFFFF]|\[(?:(['"])(?:\\.|.)*?\2|.)*?\]|\\[0-9A-F]+\w*|\\.|(['"])(?:\\.|.)*?\3)+/gsi, (m, p) => p ? `${m}.${nm}` : m)
    : txt, Cnms = { __proto__: N }, ChkNm = (obj, nm) => {
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
}, S2Hash = () => L.hash && setTimeout((_ => D.getElementById(L.hash.slice(1))?.scrollIntoView()), 6);
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
        for (let i = 0; i < count; i++) {
            yield from;
            from += step;
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
class RVU extends RV {
    constructor() {
        super(new URL(L.href));
        this.basepath = U;
        W.addEventListener('popstate', _ => this.U.href = L.href);
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
    get subpath() { return rvu.pathname.slice(this.basepath.length); }
    set subpath(s) { rvu.pathname = this.basepath + s; }
    search(fld, val) {
        let U = new URL(this.V);
        mapSet(U.searchParams, fld, val);
        return U.href;
    }
    RVAR(fld, df, nm = fld) {
        let g = () => this.query[fld], rv = RVAR(nm, g(), N, v => this.query[fld] = v);
        this.Subscribe(_ => rv.V = g() ?? df, T);
        return rv;
    }
}
const rvu = new Proxy(new RVU, ProxH);
export const docLocation = rvu, reroute = arg => {
    if (typeof arg == 'object') {
        if (arg.ctrlKey)
            return;
        arg.preventDefault();
        arg = arg.currentTarget.href;
    }
    rvu.V = new URL(arg, L.href);
};
let _ur = import.meta.url, R;
if (G._ur) {
    alert(`OtoReact loaded twice, from: "${G._ur}"\nand from: "${_ur}".`);
    throw Q;
}
ass(G, { RVAR, range, reroute, RFetch, DoUpdate, docLocation, debug: Ev('()=>{debugger}'),
    _ur
});
export async function RCompile(srcN, setts) {
    if (srcN.isConnected && !srcN.b)
        try {
            if (typeof setts == 'string')
                setts = Ev(`({${setts}})`);
            srcN.b = T;
            let m = L.href.match(`^.*(${setts?.basePattern || '/'})`), C = new RComp(N, L.origin + (rvu.basepath = m ? new URL(m[0]).pathname.replace(/[^/]*$/, Q) : Q), setts);
            await C.Compile(srcN);
            srcN.innerHTML = Q;
            AJ({ Exec: () => C.Build({
                    parN: srcN.parentElement,
                    srcN,
                    bfor: srcN
                }).then(S2Hash)
            });
        }
        catch (e) {
            alert(`OtoReact compile error: ` + Abbr(e, 1000));
        }
}
export async function DoUpdate() {
    hUpd = N;
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
                await j.Exec();
        }
        if (nodeCnt)
            R?.log(`Updated ${nodeCnt} nodes in ${(now() - start).toFixed(1)} ms`);
        env = U;
    }
}
W.addEventListener('pagehide', () => chWins.forEach(w => w.close()));
setTimeout(() => D.querySelectorAll('*[rhtml]')
    .forEach(src => RCompile(src, src.getAttribute('rhtml'))), 0);
