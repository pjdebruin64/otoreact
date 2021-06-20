// Global settings
const defaultSettings = {
    bAbortOnError:  false,  // Abort processing on runtime errors,
                            // When false, only the element producing the error will be skipped
    bShowErrors:    true,   // Show runtime errors as text in the DOM output
    bStripSpaces:   true,   // To do
    bRunScripts:    false,
}

export function RCompile(elm: HTMLElement, settings?: typeof defaultSettings) {    
    try {

        const R = RHTML;
        R.Compile(elm, {...defaultSettings, ...settings});

        orgSetTimeout(
            () => {
                const t0 = Date.now();
                R.Build({parent: elm, start: elm.firstChild, end: null, env: [], });
                console.log(`Built ${R.builtNodeCount} nodes in ${Date.now() - t0} ms`)
            }
        , 0);
        
        return R;
    }
    catch (err) {
        window.alert(`Re-Act error: ${err}`);
    }
}


// Een context is een rij identifiers die in een te transformeren DOM-tree kunnen voorkomen, maar waarvan de waarde nog niet bekend is
type Context = Array<string>;
// Een environment is een rij concrete waarden voor de identifiers IN EEN GEGEVEN CONTEXT
type Environment = Array<unknown>;
// Een afhankelijke waarde in een gegeven context is een waarde die afhangt van een environment.
// Dit wordt de betekenis, denotatie, van een expressie van type T.
type Dependent<T> = (env: Environment) => T;

type Region     = {parent: Element, start:  ChildNode, end: ChildNode, env: Environment};
type ElmBuilder = (this: RCompiler, reg: Region) => void;


type Subscriber = {parent: Element, marker: ChildNode, end: ChildNode, env: Environment, builder: ElmBuilder };

type Handler = (ev:Event) => any;

class Component {
    constructor(
        public TagName: string,
        public Parameters: Array<{id: string, default: Dependent<unknown>}> = [],
        public Slots: Array<Component> = []
    ){ }

    Builders: ElmBuilder[];
    ComponentEnv: Environment;
}
type RVAR_Light<T> = T & {_Subscribers?: Array<Subscriber>, Subscribe?: (sub:Subscriber) => void};

const globalEval = eval;

enum ModifierType {Attr, Prop, Class, Style, Event, Apply, AddToStyle, AddToClassList}

let num=0;
class RCompiler {
    instanceNum = num++;

    // Tijdens de analyse van de DOM-tree houden we de huidige context bij in deze globale variabele:
    constructor(
        private Context: Context = [], 
        private Components: Component[] = [],
    ) { 
    }

    // Compile a source tree into an ElmBuilder
    public Compile(
        elm: HTMLElement, 
        settings: typeof defaultSettings,
    ) {
        this.settings = {...defaultSettings, ...settings, };
        const t0 = Date.now();
        const savedRCompiler = RHTML;
        this.Builder = this.CompileChildNodes(elm);
        RHTML = savedRCompiler;
        const t1 = Date.now();
        console.log(`Compiled ${this.sourceNodeCount} nodes in ${t1 - t0} ms`);
        this.bCompiled = true;
    }

    public Build(reg: Region & {marker?: ChildNode}) {
        let savedRCompiler = RHTML;
        RHTML = this;
        this.Builder(reg);
        this.AllRegions.push({
            parent: reg.parent, marker: reg.marker, end:null, builder: this.Builder, env: []
        })
        RHTML = savedRCompiler;
    }

    private settings: typeof defaultSettings;
    private AllRegions: Subscriber[] = [];
    private Builder: ElmBuilder;

    private bCompiled = false;
    private bHasReacts = false;

    public DirtyRegions = new Set<Subscriber>();
    public bSomethingDirty: boolean;

    // Bijwerken van alle elementen die afhangen van reactieve variabelen
    private bUpdating = false;
    private handleUpdate: number = null;
    public RUpdate = function RUpdate(this: RCompiler) {
        clearTimeout(this.handleUpdate);
        this.handleUpdate = orgSetTimeout(() => {
            this.handleUpdate = null;
            this.DoUpdate();
        }, 10);
    }.bind(this) as () => void;

    private DoUpdate() {
        if (!this.bCompiled || this.bUpdating)
            return;
        if (!this.bHasReacts && this.bSomethingDirty)
            for (const s of this.AllRegions) this.DirtyRegions.add(s);
        if (this.DirtyRegions.size == 0)
            return;
        
        const t0 = Date.now();
        this.builtNodeCount = 0;
        this.bUpdating = true;
        this.bSomethingDirty = false;
        let savedRCompiler = RHTML;
        RHTML = this;
        for (const {parent, marker, end, builder, env} of this.DirtyRegions) {
            try { builder.call(this, {parent, start: marker ? marker.nextSibling : parent.firstChild, end, env, }); }
            catch (err) {
                const msg = `ERROR: ${err}`;
                console.log(msg);
            }
        }
        this.DirtyRegions.clear();
        RHTML = savedRCompiler;
        this.bUpdating = false;
        console.log(`Updated ${this.builtNodeCount} nodes in ${Date.now() - t0} ms`);
    }

    /* A "responsive variable" is a variable which listeners can subscribe to.
    */
    RVAR = function<T>(this: RCompiler,
        name?: string, 
        initialValue?: T, 
        storage?: Store
    ) {
        let V = new _RVAR<T>(this, name, initialValue, storage);
        if (!this.bUpdating)
            this.rvarList.push(V);
        return V;
    }.bind(this) as <T>(name?: string, initialValue?: T, storage?: Store) => _RVAR<T>;
    private rvarList: _RVAR<unknown>[] = [];
    
    public setTimeout = function(handler: Function, timeout?: number, ...args: any[]) {
        return orgSetTimeout( UpdateTimerHandler(this, handler), timeout, ...args );
    }.bind(this);
    public setInterval = function(handler: Function, timeout?: number, ...args: any[]) {
        return orgSetInterval( UpdateTimerHandler(this, handler), timeout, ...args );
    }.bind(this);

    private RVAR_Light<T>(
        t: RVAR_Light<T>, 
        subscribers: Array<Subscriber> = [],
    ): RVAR_Light<T> {
        if (!t._Subscribers) {
            t._Subscribers = subscribers;
            const R: RCompiler = this;
            Object.defineProperty(t, 'U',
                {get:
                    function() {
                        for(const sub of t._Subscribers)
                            R.DirtyRegions.add(sub);
                        return t;
                    }
                }
            );
            t.Subscribe = function(sub: Subscriber) { t._Subscribers.push(sub); } ;
        }
        return t;
    }

    private sourceNodeCount = 0;   // To check for empty Content
    public builtNodeCount = 0;

    private CompileChildNodes(srcParent: HTMLElement | DocumentFragment): ElmBuilder {
        const builders = [] as Array< [ElmBuilder, ChildNode] >;
        const contextLength = this.Context.length;
        const componentsLength = this.Components.length;

        const childNodes = Array.from( srcParent.childNodes );
        for (const srcNode of childNodes)
        {
            let builder: ElmBuilder;
            switch (srcNode.nodeType) {
                
                case Node.ELEMENT_NODE:
                    const srcElm = srcNode as HTMLElement;
                    try {
                        switch (srcElm.nodeName) {
                            case 'DEFINE': { // 'LET' staat de parser niet toe.
                                // En <DEFINE> moet helaas afgesloten worden met </DEFINE>; <DEFINE /> wordt niet herkend.
                                srcParent.removeChild(srcElm);

                                const varName = OptionalAttribute(srcElm, 'name') ?? RequiredAttribute(srcElm, 'var');
                                const trExpression = this.CompileAttributeExpression<unknown>(srcElm, 'value');
                                const iVar = this.Context.push(varName) - 1;

                                builder = function DEFINE(region) {
                                        region.env[iVar] = trExpression(region.env);
                                    };
                            } break;

                            case 'COMPONENT': {
                                srcParent.removeChild(srcElm);

                                let elmSignature = srcElm.firstElementChild;
                                if (elmSignature?.tagName == 'SIGNATURE')
                                    elmSignature = elmSignature.firstElementChild;
                                if (!elmSignature || elmSignature.tagName=='TEMPLATE')
                                    throw `Missing signature`;

                                const component =
                                    function ParseSignature(elmSignature: Element): Component {
                                        const comp = new Component(elmSignature.tagName);
                                        for (const attr of elmSignature.attributes)
                                            comp.Parameters.push(
                                                /^#/.test(attr.name)
                                                ?   { id: attr.nodeName.substr(1), default: attr.value ? this.CompileExpression(attr.value) : null }
                                                :   { id: attr.nodeName, default: attr.value ? this.CompileInterpolatedString(attr.value) : null }
                                            );
                                        for (const elmSlot of elmSignature.children)
                                            comp.Slots.push(ParseSignature(elmSlot));
                                        return comp;
                                    }(elmSignature);

                                for(let srcChild of srcElm.children as Iterable<HTMLElement>)
                                    switch (srcChild.nodeName) {
                                        case 'SCRIPT':
                                            const builder = this.CompileScript(srcElm, srcChild);
                                            if (builder) builders.push([builder, srcChild]);
                                            break;
                                        case 'STYLE':

                                            break;
                                    }
            
                                this.Components.push(component);
            
                                const template = RequiredChildElement(srcElm, 'TEMPLATE') as HTMLTemplateElement;
            
                                this.Context.push(...component.Parameters.map(p => p.id));
                                this.Components.push(...component.Slots);
                                component.Builders = [ this.CompileChildNodes(template.content) ];
                                this.Components.length -= component.Slots.length;
                                this.Context.length -= component.Parameters.length;       
                                
                                builder = (reg) => {
                                    // At runtime, we just have to remember the environment that matches the context
                                    component.ComponentEnv = reg.env.slice();
                                }
                            } break;

                            case 'IF': {
                                const computeCondition = this.CompileAttributeExpression<boolean>(srcElm, 'cond');
                                const trThen = this.CompileChildNodes(srcElm);

                                builder = function IF(region) {
                                        const {parent, env} = region;
                                        const result = computeCondition(region.env) ? true : false;
                                        const {start, end} = PrepareRegion(srcElm, region, result);

                                        if (result)
                                            trThen.call(this, {parent, start, end, env, });
                                    };
                            } break;
        
                            case 'CASE': {
                                const caseList = [] as Array<{condition: Dependent<boolean>, builder: ElmBuilder, child: HTMLElement}>;
                                for (const child of srcElm.children as Iterable<HTMLElement>) {
                                    switch (child.nodeName) {
                                        case 'WHEN':
                                            caseList.push({
                                                condition: this.CompileAttributeExpression<boolean>(child, 'cond')
                                                , builder: this.CompileChildNodes(child)
                                                , child
                                            });
                                            break;
                                        case 'ELSE':
                                            caseList.push({
                                                condition: (_env) => true
                                                , builder: this.CompileChildNodes(child)
                                                , child
                                            });
                                            break;
                                    }
                                }

                                builder = function CASE(region) {
                                    const {parent, env} = region;

                                    let result: ElmBuilder = null;
                                    for (const alt of caseList)
                                        try {
                                            if (alt.condition(region.env)) {
                                                result = alt.builder; break;
                                            }
                                        } catch (err) { throw `${OuterOpenTag(alt.child)}${err}`; }
                                        
                                    const {start, end} = PrepareRegion(srcElm, region, result);
                                    if (result)
                                        result.call(this, {parent, start, end, env, });
                                };
                            } break;
                                    
                            case 'FOREACH':
                                builder = this.CompileForeach(srcParent, srcElm);
                            break;
                                
                            case 'INCLUDE': {
                                const src = RequiredAttribute(srcElm, 'src');
                                const context = this.Context.slice(), components = this.Components.slice();
                                // Placeholder that will contain a Template when the file has been received
                                let C: RCompiler = null;
                                // List of nodes that have to be build when the builder is received
                                let arrToBuild: Array<Region> = [];
                                
                                fetch(src)
                                .then(async response => {
                                    const textContent = await response.text();
                                    // Parse the contents of the file
                                    const parser = new DOMParser();
                                    const parsedContent = parser.parseFromString(textContent, 'text/html') as HTMLDocument;

                                    // Compile the parsed contents of the file in the original context
                                    C = new RCompiler(context, components);
                                    C.Compile(parsedContent.body, this.settings, );

                                    // Achterstallige Builds uitvoeren
                                    for (const {parent, start, end, env} of arrToBuild)
                                        if (parent.isConnected)   // Sommige zijn niet meer nodig
                                        {
                                            parent.removeChild(start);
                                            C.Builder({parent, start: end, end, env, });
                                        }

                                    arrToBuild = null;
                                });

                                builder = 
                                    // Runtime routine
                                    function INCLUDE (region) {
                                        const {parent, env} = region;
                                        const {start, end} = PrepareRegion(srcElm, region);

                                        // Als de builder ontvangen is, dan meteen uitvoeren
                                        if (C?.Builder)
                                            C.Builder({parent, start, end, env, });
                                        else
                                            // Anders het bouwen uitstellen tot later
                                            arrToBuild.push({parent, start, end, env: env.slice(), });    // Kopie van de environment maken
                                    };
                            } break;

                            case 'REACT': {
                                this.bHasReacts = true;
                                const expList = RequiredAttribute(srcElm, 'on', true).split(',');
                                const getDependencies = expList.map( expr => this.CompileExpression<_RVAR<unknown>>(expr) );

                                // We transformeren de template in een routine die gewenste content genereert
                                const bodyBuilder = this.CompileChildNodes(srcElm);
                                
                                builder = function REACT(region) {
                                    const {parent, env } = region;
                                    let {start, end, marker, bInit} = PrepareRegion(srcElm, region);

                                    if (bInit) {
                                        if (start == srcElm) {
                                            start = srcElm.firstChild;
                                            srcElm.replaceWith(...srcElm.childNodes );
                                        }

                                        const subscriber: Subscriber = {
                                            parent, marker: marker, end,
                                            builder: bodyBuilder,
                                            env: env.slice(),
                                        };
                                
                                        // Subscribe bij de gegeven variabelen
                                        for(const getRvar of getDependencies) {
                                            const rvar = getRvar(env);
                                            rvar.Subscribe(subscriber);
                                        }
                                    }
                
                                    bodyBuilder.call(this, {parent, start, end, env, });
                                }
                            } break;

                            case 'RHTML': {
                                const bodyBuilder = this.CompileChildNodes(srcElm);

                                builder = function RHTML(region) {
                                    const {parent, env} = region;

                                    const elm = document.createElement('RHTML');
                                    try {
                                        bodyBuilder.call(this, {parent: elm, start: null, end: null, env});
                                        const result = elm.innerText

                                        const {marker, start, end, bUpdate} = PrepareRegion(srcElm, region, result);

                                        if (bUpdate) {
                                            elm.innerHTML = elm.innerText;

                                            const R = new RCompiler();
                                            R.Compile(elm, {...defaultSettings, bRunScripts: true });

                                            R.Build({parent, marker, start, end, env: []});
                                        }
                                    }
                                    catch (err) {
                                        if (this.settings.bShowErrors)
                                            parent.insertBefore(document.createTextNode(err), region.start)
                                        else
                                            throw err;
                                    }
                                };                                
                            } break;

                            case 'WINDOW':
                            case 'PRINT': { } break;

                            case 'SCRIPT': builder = this.CompileScript(srcParent, srcElm); break;

                            default:
                                builder = this.CompileElement(srcParent, srcElm); break;
                        }
                    }
                    catch (err) { 
                        throw `${OuterOpenTag(srcElm)} ${err}`; 
                    }

                    break;

                case Node.TEXT_NODE:
                    const str = (srcNode as Text).data.replace(/^\s+|\s+$/g, ' ');
                    const trExpres = this.CompileInterpolatedString( str );

                    builder = function Text(region) {
                        const {parent, start, end, env} = region;
                        const content = trExpres(env);
                        if (start == end) 
                            parent.insertBefore(document.createTextNode(content), end);
                        else
                        {
                            (start as Text).textContent = content;
                            region.start = start.nextSibling;
                        }
                    };
                    break;

                default:    // Other nodes (especially comments) are removed
                    srcNode.remove();
                    continue;
            }
            if (builder)
                builders.push([builder, srcNode]);
        };
        this.sourceNodeCount += childNodes.length;

        this.Components.length = componentsLength;
        this.Context.length = contextLength;

        return function ChildNodes(region) {
                const envLength = region.env.length;
                try {
                    for(const [builder, node] of builders)
                        try { 
                            builder.call(this, region);
                            const start = region.start;
                            if (start && start['RError']) {
                                region.start = start.nextSibling;
                                start.remove();
                            }
                        } 
                        catch (err) { 
                            const message = node instanceof HTMLElement ? `${OuterOpenTag(node, 40)}${err}` : err;
                            if (this.settings.bAbortOnError)
                                throw message;
                            console.log(message);
                            if (this.settings.bShowErrors)
                                region.parent.insertBefore(
                                    document.createTextNode(message), region.end
                                )['RError'] = true;
                        }
                    this.builtNodeCount += builders.length;
                }
                finally {
                    region.env.length = envLength;
                }
            };
    }

    private CompileScript(srcParent: HTMLElement | DocumentFragment, srcElm: HTMLElement) {
        srcParent.removeChild(srcElm);
        if (!(this.settings.bRunScripts || srcElm.hasAttribute('nomodule')))
            return null;
        const script = srcElm.textContent
            //, bIsModule = (OptionalAttribute(srcElm, 'type') == 'module');
        let bDone = false;  
        return function SCRIPT(_) {
            //if (bIsModule)
            //    import( `data:text/javascript;charset=utf-8,${encodeURI(script)}`);
            //else
                globalEval(`'use strict';${script}`);
            bDone = true
        };
            //const content = this.CompileExpression(script, '{}' , true); 
    }

    private CompileForeach(srcParent: HTMLElement | DocumentFragment, srcElm: HTMLElement) {
        const varName = OptionalAttribute(srcElm, 'let');
        if (!varName) { 
            /* Iterate over multiple slot instances */
            const ofExpression = OptionalAttribute(srcElm, 'of');
            const slot = this.Components.find(C => C.TagName == ofExpression)
            if (!slot)
                throw `Missing attribute [let]`;

            const bodyBuilder = this.CompileChildNodes(srcElm);
            srcParent.removeChild(srcElm);

            return function FOREACH_Slot(region) {
                
                const {parent, env} = region;
                let { start, end, } = PrepareRegion(srcElm, region);
                const subReg: Region = {parent, start, end, env, }
                const slotBuilders = slot.Builders;
                for (let slotBuilder of slotBuilders) {
                    slot.Builders = [slotBuilder];
                    bodyBuilder.call(this, subReg);
                }
                slot.Builders = slotBuilders;
                region.start = end.nextSibling;
            }
        }
        else { /* A regular iteration */
            interface Item {};  // Three unknown but distinct types
            interface Key {};
            interface Hash {};
            const getRange = this.CompileAttributeExpression<Iterable<Item>>(srcElm, 'of' );
            const indexName = srcElm.getAttribute('index');
            const prevName = srcElm.getAttribute('previous');

            const bUpdateable = CBool(srcElm.getAttribute('updateable'), true);
            const updatesTo =  srcElm.getAttribute('updates');
            const getUpdatesTo = updatesTo && this.CompileExpression<_RVAR<unknown>>(updatesTo);
            
            const contextLength = this.Context.length;
            try {
                // Voeg de loop-variabele toe aan de context
                const iVar = this.Context.push(varName) - 1;

                const getKey = this.CompileExpression<Key>( srcElm.getAttribute('key') );
                const getHash = this.CompileExpression<Hash>( srcElm.getAttribute('hash') );

                // Optioneel ook een index-variabele, en een variabele die de voorgaande waarde zal bevatten
                const iIndex = (indexName ? this.Context.push(indexName) : 0) - 1;
                const iPrevious = (prevName ? this.Context.push(prevName) : 0) - 1;
                
                // Compileer alle childNodes
                if (srcElm.childNodes.length ==0)
                    throw "FOREACH has an empty body.\nIf you placed <FOREACH> within a <table>, then the parser has rearranged these elements.\nUse <table.>, <tr.> etc instead.";
                const bodyBuilder = this.CompileChildNodes(srcElm);
                
                srcParent.removeChild(srcElm);

                // Dit wordt de runtime routine voor het updaten:
                return function FOREACH(region) {
                        const {parent, env} = region;
                        let {marker, start, end, bInit} = PrepareRegion(srcElm, region, null, (getKey == null));
                        const subReg: Region = {parent, start, end, env, }

                        let index = 0, prevItem: Item = null;

                        // Map of previous data, if any
                        const keyMap: Map<Key, Subscriber>
                            = (bInit ? marker['keyMap'] = new Map() : marker['keyMap']);
                        // Map of the newly obtained data
                        const newMap: Map<Key, [Item, Hash] > = new Map();
                        for (const item of getRange(env)) {
                            env[iVar] = item;
                            const hash = getHash && getHash(env);
                            const key = getKey ? getKey(env) : hash;
                            newMap.set(key ?? {}, [item, hash]);
                        }

                        function RemoveStaleItemsHere() {
                            let key: Key;
                            while (start != end && start && !newMap.has(key = start['key'])) {
                                if (key != null)
                                    keyMap.delete(key);
                                let node = start;
                                start = (start['endNode'] as ChildNode).nextSibling;
                                while (node != start) {
                                    const next = node.nextSibling;
                                    parent.removeChild(node);
                                    node = next;
                                }
                            }
                        }
                        RemoveStaleItemsHere();

                        // Voor elke waarde in de range
                        for (const [key, [item, hash]] of newMap) {
                            // Environment instellen
                            let rvar: Item =
                                ( getUpdatesTo ? this.RVAR_Light(item as object, Array.from(getUpdatesTo(env).Subscribers))
                                : bUpdateable ? this.RVAR_Light(item as object)
                                : item
                                );
                            env[iVar] = rvar;
                            if (iIndex >= 0)
                                env[iIndex] = index;
                            if (iPrevious >= 0)
                                env[iPrevious] = prevItem;

                            let marker: ChildNode;
                            let subscriber = keyMap.get(key);
                            if (subscriber && subscriber.marker.isConnected) {
                                // Item already occurs in the series
                                marker = subscriber.marker;
                                
                                if (marker != start) {
                                    // Item has to be moved
                                    let node = marker.nextSibling;
                                    marker = parent.insertBefore(marker, start);
                                    while (node != subscriber.end) {
                                        const next = node.nextSibling;
                                        parent.insertBefore(node, start);
                                        node = next;
                                    }
                                }
                                
                                (marker as Comment).textContent = `${varName}(${index})`;
                                subReg.start = marker.nextSibling;
                                subReg.end = subscriber.end;
                            }
                            else {
                                // Item has to be newly created
                                marker =  parent.insertBefore(document.createComment(`${varName}(${index})`), start);
                                const endMarker = parent.insertBefore(document.createComment(`/${varName}`), start);
                                marker['key'] = key;
                                marker['endNode'] = subReg.start = subReg.end = endMarker;
                                
                                subscriber = {
                                    parent,
                                    marker, 
                                    end: endMarker,
                                    builder: (bUpdateable ? bodyBuilder : undefined),
                                    env: (bUpdateable ? env.slice() : undefined), 
                                }
                                if (key != null) {
                                    if (keyMap.has(key))
                                        throw `Duplicate key '${key}'`;
                                    keyMap.set(key, subscriber);
                                }
                            }

                            if (hash != null
                                && ( hash == marker['hash'] as Hash
                                    || (marker['hash'] = hash, false)
                                    )
                            ) { }   // Nothing to do
                            else    // Body berekenen
                                bodyBuilder.call(this, subReg);

                            start = subReg.end.nextSibling;
                            if (bUpdateable)
                                (rvar as _RVAR<Item>).Subscribe(subscriber);

                            prevItem = item;
                            index++;
                            
                            RemoveStaleItemsHere();
                        }

                        // Oude environment herstellen
                        env.length = contextLength;
                        region.start = end.nextSibling;
                    };
            }
            finally {
                // Herstel de oude context
                this.Context.length = contextLength;
            }
        }
    }

    private CompileElement(srcParent: HTMLElement | DocumentFragment, srcElm: HTMLElement) {
        // See if this node is a user-defined component
        for (let i = this.Components.length-1; i>=0; i--) {
            const component: Component = this.Components[i];
            if (component.TagName == srcElm.tagName) {
                /* We have a component - instance */
                srcParent.removeChild(srcElm);
                const contextLength = this.Context.length;

                const computeParameters: Array<Dependent<unknown>> =
                    component.Parameters.map(param => this.CompileParam(srcElm, param.id));

                const slotBuilders : ElmBuilder[][] =
                    component.Slots.map(slot => {
                        const slotBuilderArray: ElmBuilder[] = [];
                        for (let slotElm of srcElm.children as Iterable<HTMLElement>)
                            if (slotElm.tagName == slot.TagName) 
                                try {
                                    for (const param of slot.Parameters)
                                        this.Context.push( RequiredAttribute(slotElm, param.id) || param.id );
                                    slotBuilderArray.push(this.CompileChildNodes(slotElm))
                                }
                                catch (err) {
                                    throw `${OuterOpenTag(slotElm)}: ${err}`;
                                }
                                finally { this.Context.length = contextLength; }
                        return slotBuilderArray;
                    });

                return (region: Region) => {
                    const {parent, env} = region;
                    const {start, end} = PrepareRegion(srcElm, region);
                    component.ComponentEnv.push( ...computeParameters.map(arg => arg(env)) )
                    try {
                        const prevBuilders = [];        
                        let i = 0;
                        for (const slot of component.Slots) {
                            prevBuilders.push(slot.Builders);
                            slot.Builders = slotBuilders[i++];
                            slot.ComponentEnv = env.slice();
                        }

                        try { for (let builder of component.Builders)
                                builder.call(this, {parent, start, end, env: component.ComponentEnv, }); 
                            }
                        finally {
                            for (const slot of component.Slots)
                                slot.Builders = prevBuilders.shift();
                        }
                    }
                    finally {
                        component.ComponentEnv.length -= component.Parameters.length;
                    }
                }
            }
        }
            
        {   /* It's regular element that should be included in the runtime output */
            // Remove trailing dots
            const nodeName = srcElm.nodeName.replace(/\.$/, '');

            // We turn each given attribute into a modifier on created elements
            const arrModifiers = [] as Array<{
                modType: ModifierType,
                name: string,
                depValue: Dependent<unknown>,
                tag?: string,
            }>;

            for (const attr of srcElm.attributes) {
                const attrName = attr.name;
                let m: RegExpExecArray;
                try {
                    if (m = /^on(.*)$/i.exec(attrName)) {               // Events
                        const oHandler = this.CompileExpression<Handler>(
                            `function ${attrName}(event){${CheckForComments(attr.value)}}`);
                        arrModifiers.push({
                            modType: ModifierType.Event, name: m[1], 
                            depValue: oHandler
                        });
                    }
                    else if (m = /^#class:(.*)$/.exec(attrName))
                        arrModifiers.push({
                            modType: ModifierType.Class, name: m[1],
                            depValue: this.CompileExpression<boolean>(attr.value)
                        });
                    else if (m = /^#style\.(.*)$/.exec(attrName))
                        arrModifiers.push({
                            modType: ModifierType.Style, name: CapitalizeProp(m[1]),
                            depValue: this.CompileExpression<unknown>(attr.value)
                        });
                    else if (attrName == '+style')
                        arrModifiers.push({
                            modType: ModifierType.AddToStyle, name: null,
                            depValue: this.CompileExpression<object>(attr.value)
                        });
                    else if (m = /^#(.*)/.exec(attrName))
                        arrModifiers.push({
                            modType: ModifierType.Prop, name: CapitalizeProp(m[1]),
                            depValue: this.CompileExpression<unknown>(attr.value)
                        });
                    else if (attrName == "+class")
                        arrModifiers.push({
                            modType: ModifierType.AddToClassList, name: null,
                            depValue: this.CompileExpression<object>(attr.value)
                        });
                    else if (attrName == "apply")
                        arrModifiers.push({
                            modType: ModifierType.Apply, name: null,
                            depValue: this.CompileExpression(`function apply(){${CheckForComments(attr.value)}}`)
                        });
                    else if (m = /^\*(\*)?(.*)$/.exec(attrName)) {
                        const propName = CapitalizeProp(m[2]);
                        const setter = this.CompileExpression<Handler>(`function (){${attr.value} = this.${propName}; }`);
                        arrModifiers.push({
                            modType: ModifierType.Apply, name: null,
                            depValue: setter,
                        });
                        arrModifiers.push({
                            modType: ModifierType.Event, name: m[1] ? 'change' : 'input', tag: propName, depValue: setter,
                        })
                    }
                    else if (m = /^@(@)?(.*)$/.exec(attrName)) {
                        const propName = CapitalizeProp(m[2]);
                        const setter = this.CompileExpression<Handler>(`function (){${attr.value} = this.${propName}; }`)
                        arrModifiers.push({
                            modType: ModifierType.Prop, name: propName,
                            depValue: this.CompileExpression<unknown>(attr.value)
                        });
                        arrModifiers.push({
                            modType: ModifierType.Event, name: m[1] ? 'change' : 'input', tag: propName, depValue: setter,
                        })
                    }
                    else
                        arrModifiers.push({
                            modType: ModifierType.Attr, name: attrName,
                            depValue: this.CompileInterpolatedString(attr.value)
                        });
                }
                catch (err) {
                    throw(`[${attrName}]: ${err}`)
                }
            }

            // Compile the given childnodes into a routine that builds the actual childnodes
            const childnodesBuilder = this.CompileChildNodes(srcElm);

            // Now the runtime action
            return function Element(region) {
                const {parent, start, end, env, } = region;
                // Create the element
                let elm: HTMLElement, bNew: boolean;
                if (bNew = (start == end)) {
                    elm = document.createElement(nodeName);
                    parent.insertBefore(elm, end);
                }
                else {
                    region.start = start.nextSibling;
                    
                    if (start.nodeName != nodeName) {
                        elm = document.createElement(nodeName);
                        parent.replaceChild(elm, srcElm);
                        bNew = true;
                    }   
                    else {
                        elm = start as HTMLElement;
                        //delete elm.className;
                        elm.classList.remove(...elm.classList);
                    }
                }
                
                // Add all children
                childnodesBuilder.call(this, {parent: elm, start: elm.firstChild, end: null, env, });

                // Apply all modifiers: adding attributes, classes, styles, events
                for (const mod of arrModifiers) {
                    const attName = mod.name;
                    try {
                        const val = mod.depValue(env);    // Evaluate the dependent value in the current environment
                        // See what to do with it
                        switch (mod.modType) {
                            case ModifierType.Attr:
                                elm.setAttribute(attName, val as string ?? ''); 
                                break;
                            case ModifierType.Prop:
                                if (val != null)
                                    elm[attName] = val;
                                else
                                    delete elm[attName];
                                break;
                            case ModifierType.Event: {
                                // We store the new handler under some 'tag', so that we can remove it on the next run
                                const tag = `$$${mod.tag ?? attName}`;
                                let prevHandler: EventListener;
                                if (prevHandler = elm[tag]) elm.removeEventListener(attName, prevHandler) 
                                elm.addEventListener(attName, elm[tag] = UpdateHandler(this, (val as Handler).bind(elm)
                                    ));
                            } break;
                            case ModifierType.Class:
                                if (val)
                                    elm.classList.add(attName);
                                break;
                            case ModifierType.Style:
                                if (val)
                                    elm.style[attName] = val; 
                                else
                                    delete elm.style[attName];
                                break;
                            case ModifierType.Apply:
                                (val as ()=>void).call(elm); 
                                break;
                            case ModifierType.AddToStyle:
                                Object.assign(elm.style, val); break
                            case ModifierType.AddToClassList:
                                if (Array.isArray(val))
                                    for (const className of val as string[])
                                        elm.classList.add(className);
                                else
                                    for (const [className, bln] of Object.entries<boolean>(val as {}))
                                        if (bln)
                                            elm.classList.add(className);
                        }
                    }
                    catch (err) { throw `[${attName}]: ${err}`; }
                }

                if (nodeName=='SCRIPT')
                    (elm as HTMLScriptElement).text = elm.textContent;
            };
        }
    }

    private CompileParam(elm: HTMLElement, param: string): Dependent<unknown> {
        if (elm.hasAttribute(`#${param}`))
            return this.CompileExpression( elm.getAttribute(`#${param}`));
        return this.CompileInterpolatedString( RequiredAttribute(elm, param));
    }

    private CompileInterpolatedString(data: string, name?: string): Dependent<string> {
        const generators: Array< string | Dependent<unknown> > = [];
        function addString(s: string) {
            generators.push( s.replace(/\\(?=[{}\\])/g, '') );
        }

        const reg = //  /(?:\{((?:[^{}]|\{[^{}]*\})*?)\})|$/gs;
            /(?<!\\)\{(.*?)(?<!\\)\}|$/gs;
        while (reg.lastIndex < data.length) {
            const lastIndex = reg.lastIndex
            const m = reg.exec(data);
            const fixed = lastIndex < m.index ? data.substring(lastIndex, m.index) : null;

            if (fixed)
                addString(fixed);
            if (m[1])
                generators.push( this.CompileExpression<string>(m[1], '{}', null, true) );
        }

        return (env) => {
            try {
                //return generators.map(gen => ( typeof gen == 'string' ? gen : gen(env) ?? '')).join();
                let result = "";
                for (const gen of generators)
                    result += 
                        ( typeof gen == 'string' ? gen : gen(env) ?? '');
                return result;
            }
            catch (err) { throw `[${name}]: ${err}`; }
        }
    }

    private CompileAttributeExpression<T>(elm: HTMLElement, attName: string) {
        return this.CompileExpression<T>(RequiredAttribute(elm, attName, true));
    }

    private CompileExpression<T>(
        expr: string,           // Expression to transform into a function
        delims: string = "\"\"" // Delimiters to put around the expression when encountering a compiletime or runtime error
        , bScript: boolean = false
        , bReturnErrors = false   // true: yield errormessage als result. <T> has to be <string>.
        , name?: string
    ): Dependent<T> {
        if (expr == null) return null;
        expr = CheckForComments(expr);
        let depExpr = 
            bScript 
            ?  `([${this.Context.join(',')}]) => {'use strict';${expr}}`  // Braces
            :  `([${this.Context.join(',')}]) => (${expr})`;              // Parentheses
        const errorInfo = `${name ? `[${name}] ` : ''}${delims[0]}${Abbreviate(expr,60)}${delims[1]}: `;

        try {
            const routine = globalEval(depExpr) as (env:Environment) => T;
            return (env: Environment) => {
                try {
                    return routine(env);
                } 
                catch (err) { 
                    const message = `${errorInfo}${err}`;
                    if (bReturnErrors && !this.settings.bAbortOnError) {
                        console.log(message);
                        return (this.settings.bShowErrors ? message : "") as unknown as T;
                    }
                    else
                        throw message;
                }   // Runtime error
            }
        }
        catch (err) { throw `${errorInfo}${err}`; }             // Compiletime error
    }
}

function PrepareRegion(srcElm: HTMLElement, region: Region, result: unknown = null, bForcedClear: boolean = false) {
    let {parent, start} = region;
    let marker: ChildNode, end: ChildNode, bInit: boolean, bUpdate: boolean;
    if (bInit = !(start && (end = start['endNode']))) {
        marker = parent.insertBefore(document.createComment(srcElm.tagName), start);
        end = parent.insertBefore(
            document.createComment(`/${srcElm.tagName}`),
            start == srcElm ? srcElm.nextSibling : start);
        marker['endNode'] = end;
    }
    else {
        marker = start;
    }
    start = marker.nextSibling;
    region.start = end.nextSibling;

    if (bUpdate = (bForcedClear || (result != marker['result'] ?? null)) ) {
        marker['result'] = result;
        while (start != end) {
            const next = start.nextSibling;
            parent.removeChild(start);
            start = next;
        }
    }
    return {marker, start, end, bInit, bUpdate};
}

// Deze routine zet een gegeven MouseHandler om in een handler die hetzelfde doet en daarna alle benodigde elementen update
function UpdateHandler(R: RCompiler, handler: Handler): Handler {
    return handler &&
        function ReactiveHandler(ev: Event) {
            // console.log(`EVENT ${name}`);
            const result = handler(ev);
            // De handler mag een Promise opleveren; in dat geval doen we de RUpdate pas wanneer de promise vervult is
            if (result instanceof Promise) {
                result.then(R.RUpdate);
                ev.preventDefault();
                return;
            }
        
            R.RUpdate();
            // Als de handler, gedefinieerd als attribuut, false oplevert, dan wordt de default actie vanzelf voorkomen.
            // Wij voegen de handler toe middels 'addEventListener' en dan gaat dat niet vanzelf.
            // We lossen het zo op:
            if (result === false)
                ev.preventDefault();
            return result;
        };
}


interface Store {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}
class _RVAR<T>{
    constructor(
        private rRuntime: RCompiler,
        private name?: string, 
        initialValue?: T, 
        private storage?: Store
    ) {
        if (name) {
            //if (name in globalThis) window.alert(`new RVAR('${name}'): '${name}' already exists.`);
            globalThis[name] = this;
        }
        let s: string;
        if ((s = storage?.getItem(`RVAR_${name}`)) != null)
            try {
                this._Value = JSON.parse(s);
                return;
            }
            catch{}
        this._Value = initialValue;
    }
    // The value of the variable
    private _Value: T;
    // The subscribers
    // .Elm is het element in de DOM-tree dat vervangen moet worden door een uitgerekende waarde
    // .Content is de routine die een nieuwe waarde uitrekent
    Subscribers: Set<Subscriber> = new Set();

    Subscribe(s: Subscriber) {
        this.Subscribers.add(s);
    }

    // Use var.V to get or set its value
    get V() { return this._Value; }
    // When setting, it will be marked dirty.
    set V(t: T) {
        if (t !== this._Value) {
            this._Value = t;
            this.SetDirty();
            this.storage?.setItem(`RVAR_${this.name}`, JSON.stringify(t));
        }
    }

    // Use var.U to get its value for the purpose of updating some part of it.
    // It will be marked dirty.
    // Set var.U to have the DOM update immediately.
    get U() { this.SetDirty();  return this._Value; }
    set U(t: T) { this.V = t;   this.rRuntime.RUpdate();  }

    SetDirty() {
        for(const sub of this.Subscribers)
            if (sub.parent.isConnected)
                this.rRuntime.DirtyRegions.add(sub);
            else
                this.Subscribers.delete(sub);
        this.rRuntime.bSomethingDirty = true;
    }
}
    
function UpdateTimerHandler(R: RCompiler, handler: Function) {
    return function(...args) { 
        const result = handler(...args);
        if (result instanceof Promise)
            result.then(R.RUpdate);
        else
            R.RUpdate();
    }
}

function CapitalizeProp(lcName: string) {
    let m: RegExpExecArray;
    lcName = lcName.replace('html', 'HTML');
    while(m = /^(.*(align|animation|aria|background|border|bottom|class|client|column|content|element|font|image|inner|left|right|rule|top|value))([a-z])(.*)$/.exec(lcName))
        lcName = `${m[1]}${m[3].toUpperCase()}${m[4]}`;
    return lcName;
}

function CheckForComments(script: string) {
    // When the script contains '//' without a trailing newline, which might be a comment
    const hasComments = /\/\/[^\n]*$/.test(script);
    // Then add a newline to terminate the possible comment
    return hasComments ? script + '\n' : script;
}

function RequiredAttribute(elm: HTMLElement, name: string, bHashAllowed = false) {
    let value = elm.getAttribute(name);
    if (value==null && bHashAllowed) {
        name = `#${name}`;
        value = elm.getAttribute(name);
    }
    if (value == null)
        throw `Missing attribute [${name}]`;
    return value;
}
function OptionalAttribute(elm: HTMLElement, name: string) {
    return elm.getAttribute(name);
}
function RequiredChildElement(elm: HTMLElement, name: string) {
    const result = OptionalChildElement(elm, name);
    if (!result)
        throw `Missing child element <${name}>`;
    return result;
}
function OptionalChildElement(elm: HTMLElement, name: string) {
    let child = elm.firstElementChild;
    let result = null;
    while (child) {
        if (name=='*' || child.tagName==name) {
            if (result)
                throw `Multiple child elements <${name}>`;
            result = child;
        }
        child = child.nextElementSibling;
    }
    return result;
}

function OuterOpenTag(elm: HTMLElement, maxLength?: number): string {
    return Abbreviate(/<.*?>/.exec(elm.outerHTML)[0], maxLength);
}
function Abbreviate(s: string, maxLength: number) {
    if (maxLength && s.length > maxLength)
        return s.substr(0, maxLength - 3) + "...";
    return s;
}

function CBool(s: string|boolean, valOnEmpty?: boolean): boolean {
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


// Modify timer functions to include an RUpdate
const orgSetTimeout = setTimeout;
const orgSetInterval = setInterval;
export let RHTML = new RCompiler();
export let RVAR = RHTML.RVAR;
export let RUpdate = RHTML.RUpdate;

Object.defineProperties(
    globalThis,
    {
        RVAR:       {get: () => RHTML.RVAR},
        RUpdate:    {get: () => RHTML.RUpdate},
        setTimeOut: {get: () => RHTML.setTimeout},
        setInterval:{get: () => RHTML.setInterval},
    }
);
globalThis.RCompile = RCompile;