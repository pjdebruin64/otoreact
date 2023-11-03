
// Colorcoding
let bRSTYLE = false;
const 
    mapping = {'<': '&lt;', '>': '&gt;', '&': '&amp;'}
    , quoteHTML = s => s.replace(/[<&>]/g, ch => mapping[ch])
    , markJScript = (script: string) =>
        `<span style='color:purple'>${
            script.replace(/\/[^\/*](?:\\\/|[^])*?\/|(\/\/[^\n]*|\/\*[^]*?\*\/)/g
                , (m,mComm) => mComm ? `<span class=demoGreen>${quoteHTML(m)}</span>` : quoteHTML(m)
            )
        }</span>`
    , markTag = (mTag: string) => {
        if (/^\/?RSTYLE/i.test(mTag))
            bRSTYLE = !bRSTYLE;
        return `<span class=mTag>&lt;${
                mTag.replace(/(\s(?:(?:on|[#*+!@]+)[a-z0-9_.]+|cond|of|let|key|hash|updates|reacton|thisreactson|on|store)\s*=\s*)(?:(['"])([^]*?)\2|([^ \t\n\r>]*))|\\{|(\{(?:\{[^]*?\}|[^])*?\})|./gi
                //               (a1                                                                                             )   (a2  )(a3   )   (a4          )      (mExpr                  )            
                    , (m,a1,a2,a3,a4,mExpr) => 
                        ( mExpr ? `<span class=otored>${mExpr}</span>`
                        : a2 ? `${a1}${a2}${markJScript(a3)}${a2}`
                        : a1 ? `${a1}${markJScript(a4)}`
                        : quoteHTML(m)
                        )
                    )
            }&gt;</span>`;
    }
    , reg = /(<!--[^]*?-->)|<((script|style)[^]*?)>([^]*?)<(\/\3\s*)>|<((?:\/?\w[^ \t\n>]*)(?:"[^]*?"|'[^]*?'|[^])*?)>|(?:\\)\{|(\$?\{(?:\{[^]*?\}|[^])*?\})|([<>&])/gi
    , ColorCode = (html: string) =>
      `<span style='color:black'>${
          html.replace(
              reg
              , (m,
                  mComm,      // This is HTML comment
                  mScriptOpen,mScriptTag,mScriptBody,mScriptClose, // These form a <script> or <style> element
                  mTag,       // This is any other tag
                  mExpr,      // This is an embedded expression
                  mChar,      // A special character
                  ) =>
                      ( mComm ? `<span class=demoGreen>${quoteHTML(m)}</span>`   // Mark HTML comments
                      : mScriptTag ? 
                              markTag(mScriptOpen)                    // Mark <script> tag
                              + markJScript(mScriptBody)
                              + markTag(mScriptClose)
                      : mTag  ? markTag(mTag)
                      : mExpr ?                                       // Interpolated string {} or ${}
                          bRSTYLE && !/^\$/.test(mExpr)               // Inside an <RSTYLE>, we ignore {}
                          ? mExpr.slice(0,1) + ColorCode(mExpr.slice(1))
                          : `<span class=otored>${m}</span>`
                      : mChar ? mapping[mChar]
                      : m
                      )
          )
      }</span>`;


function Indent(text: string, n: number) {
    return text.split('\n').map(line => line.padStart(line.length + n)).join('\n');
}


const sampleGreeting=
`<!-- Create a local reactive state variable (RVAR) to receive the entered name -->
<DEFINE rvar='yourName'></DEFINE>

<p>
    What's your name?
    <!-- The value of the RVAR ('yourName.V') is bound to the value of the input element -->
    <input type=text @value="yourName">
</p>

<!-- If yourName.V is nonempty, -->
<IF cond="yourName">
    <!-- then we show: -->
    <p>
        Nice to meet you, {yourName}. <!-- yourName.V is inserted here -->
        <br>By the way, your name consists of {yourName.length} characters.
    </p>
</IF>`;

const sampleTicTacToe = 
`<style>
    main {
        display:grid;
        grid-template-columns: auto 120pt;
        background-color: white;
    }
    header {
        grid-column: 1/3;
        text-align: center;
    }
    table {
        width: fit-content;
        margin:1ex
    }
    td {
        height: 4ex; width: 4ex;
        padding: 0px;
        border: 2px solid;
        line-height: 1;
        text-align: center;
        vertical-align: middle;
    }
    button {
        font-size: 80%;
    }
</style>

<!-- By using a local script, multiple instances of this game will have their own state -->
<script type="otoreact/local" 
  defines="board,toMove,outcome,ClearAll,Move,CheckWinner"
>
    let
      board =    RVAR(),    // State of the board
      toMove =   RVAR(null, '✕'),  // Player to move: '◯' or '✕'
      outcome =  RVAR(),    // Player that has won, or boolean true when it's a draw
      count = 0;            // Number of moves made

    function ClearAll() {
        // Initialize the board as an array of arrays of objects {P: '◯' | '✕'}
        board.V = Board();
        // Reset the outcome
        outcome.V = null;
        count = 0;
        
        function Cell() {return {P: null}; }
        function Row()  {return [Cell(), Cell(), Cell()]; }
        function Board(){return [Row(), Row(), Row()]; }
    }

    ClearAll();

    function Move(cell) {
        // Play a move, when allowed
        if (outcome.V || cell.P) // Move not allowed
          return;
        cell.U.P = toMove.V; // Update the cell
        toMove.V = (toMove.V=='✕' ? '◯' : '✕'); // Set next player to move
        count++;   // Count moves
        outcome.V = CheckWinner(board.V) || count==9; // Check end of game
    }

    function CheckWinner(b) {
        // Check if there is a winner
        let w = null;
        for (let i=0;i<3;i++) {
            w = w || CheckRow(...b[i]);   // Horizontal row
            w = w || CheckRow(b[0][i], b[1][i], b[2][i]); // Vertical row
        }
        for (let i=-1;i<=1;i+=2)
            w = w || CheckRow(b[0][1+i], b[1][1], b[2][1-i]); // Diagonal row
        return w;

        function CheckRow(c1, c2, c3) {
            // Return the result when the three cells have the same state
            return (c1.P == c2.P && c2.P == c3.P && c1.P);
        }
  }
</script>

<main>
  <header>
    <b>Tic-Tac-Toe</b>
  </header>

  <!-- Show the board -->
  <table.>
          <!-- This table should react on the RVAR 'board'. -->
    <for let=row of="board">
      <tr.>
        <for let=cell of="row" reacting>
          <td. onclick="Move(cell)"
           >{cell.P}</td.>
        </for>
      </tr.>
    </for>
  </table.>
  
  <!-- Show either the outcome, or the player to move -->
  <div>
    <p>
      <case>
        <when cond="outcome == false">
          Player to move: {toMove}
        </when>
        <when cond="outcome == true">
          <b>It's a draw.</b>
        </when>
        <else>
          <b>The winner is: <large>{outcome}</large></b>
        </else>
      </case>
    </p>
    <button onclick="ClearAll()">Clear</button>
  </div>
</main>`;

const fileTemplate = 
`<!DOCTYPE html>
<html>
    <head>
        <script type=module src="OtoReact.js"></script>
    </head>
    <body rhtml>

        <!-- Here goes your RHTML -->

    </body>
</html>
`
, sampleServerData2=
`<style scope=local>
  main {
    height:45em;
    width:100%;
    overflow-y:scroll;
  }
  table {
    margin: auto;
  }
  td {
    padding: 0px 4px;
    text-align: center;
    max-width: 8em;
    overflow:hidden;
    font-size: small;
  }
</style>

<!-- We tell OtoReact to define these names in global scope. -->
<script type=otoreact defines="ColorTable,toHex,handle,StartStop" >

// Here we store the data as an Array<{name:string, red:number, green:number, blue:number}>
const ColorTable = RVAR( null,
  /* Asynchronously fetch the data.
    When the data has been received, the RVAR will be updated and the table will be drawn.
   */
  RFetch("demo/webColors.json").then(response => response.json())
);

/* Utility for 2-digit hex code */
function toHex(n){ 
  return n.toString(16).toUpperCase().padStart(2,'0');
}

/* Rotation */
let handle=RVAR();

function StartStop() {
  if (handle > 0) {
    clearInterval(handle);
    handle.V = -1;
  }
  else
    // Modify the data array every 330ms; the DOM table will automatically be updated accordingly.
    handle.V = setInterval( () => ColorTable.U.push(ColorTable.V.shift()) , 350)
}
</script>

<main>
<!--
    The dots behind tag names are needed because HTML does not allow <FOR> as a child of <TABLE>.
    OtoReact removes these dots.
-->
<table.>

  <!-- Table caption -->
  <caption.>Web Colors 
    <button onclick="StartStop();" style="float:right; width:5em">
        {handle > 0 ? 'Stop' : 'Rotate'}
    </button>
  </caption.>

  <!-- Column headers -->
  <tr.>
    <th.>Name</th.>
    <th.>R</th.> <th.>G</th.> <th.>B</th.>
    <th.>Hex</th.>
  </tr.>

  <!-- Detail records -->
  <!-- RVAR 'ColorTable' is defined in the script;
    'hash=C' tells OtoReact that it doesn't need to update the body of each iteration if 'C' remains the same object.
  -->
  <tbody.>
    <FOR let=C of="ColorTable" hash=C>
      <tr. 
        style.backgroundColor="rgb({C.red},{C.green},{C.blue})" 
        #style.color = "C.green<148 ? 'white' : 'black'"
      >
        <td.>{C.name}</td.>
        <td.>{C.red}</td.>
        <td.>{C.green}</td.>
        <td.>{C.blue}</td.>
        <td.>
          #{toHex(C.red)+toHex(C.green)+toHex(C.blue)}
        </td.>
      </tr.>
    </FOR>
  </tbody.>

</table.>
</main>`;
/* 

  @keyframes Disappearing {
    from {line-height: 80%}
    to   {line-height: 0%}
  }  
  table.animate > tbody > tr:first-child {
    animation: Disappearing 280ms linear 70ms forwards
  }

  
<table. #class:animate="handle.V">
*/

const sampleBraces =
`1 + 1 = {1 + 1}  \\{ Check }
<p>
Null and undefined are not shown:    "{null} {undefined}".
<br>
Compare this JavaScript template literal:    "{ \`\${null} \${undefined}\` }".
<p>
Tag <{}br> looks better in source code than &lt;br&gt;
<p>
To show a literal backslash right in front of an embedded expression, write \\$:
\\${ 1 + 1 }`;

const sampleGreeting2 =
`<!-- Create a "Reactive variable" with a local name and
   persisted in localStorage -->
<define rvar='yourName' store=sessionStorage></define>

<p>What's your name?
  <input type=text @value="yourName">
  <!-- The "@" introduces a two-way binding for the input element.
  Anytime an input event happens, 'yourName.V' will be updated, and the DOM as well  -->
</p>
<if cond="yourName">
  <p> Nice to meet you, {yourName}.
    <br>By the way, your name consists of {yourName.length} 
        characters.
  </p>
</if>`;

const sampleSqrt=
`<define rvar=x #value=2></define>
<p  title="sqrt({x}) = {Math.sqrt(x)}"
>
    What is sqrt({x})? Check the tooltip.
</p>
<button onclick="x.V += 1">Increment</button>`;

const sampleInlineStyles=
`<p style.backgroundColor="lightgrey"> Light grey </p>

<define var=color value="red"></define>
<p #style.backgroundColor="color"> Colored </p>

<define var=stringStyle value="color: orange; font-style: italic"
></define>
<p #style="stringStyle">String style</p>

<define var=objectStyle #value="{color: 'green', fontWeight: 'bold'}"
></define>
<p #style="objectStyle">Object style</p>`;

const sampleParticipants=
`<!-- Here we use a local RVAR -->
<define rvar=Participants #value="['Joe', 'Mary', 'Eileen']"></define>

<b>Participants:</b>
<ul>
    <for let=participant of="Participants">
        <li>{participant}</li>
    </for>
</ul>

New participant (Enter):
<br><input type=text onchange="
      if(this.value) {
          Participants.U.push(this.value);
          this.value=''; 
      }
">
<!-- "this" in all RHTML event handlers refers to the target element.
  Getting "Participants.U" means "Participants" will be marked as changed, even though it is not assigned to. -->`;

const sampleTODO=
`<script type=otoreact defines=AddItem,TODO>
    // Define the data model of our todo list
    let TODO = RVAR('TODO',
        [['Visit Joe', true], ['Fishing',false], ['Sleeping',false], ['Working',false]]
        , sessionStorage
    );

    // Adding an item to the list
    function AddItem(inputElem) {
        if (inputElem.value) {
            TODO.U.push( [inputElem.value, false] );
            inputElem.value = '';
        }
    }
</script>

<!-- Define a component, showing a filtered list of to-do-items, with a caption -->
<component>
    <!-- This is the component signature -->
    <ItemList caption bDone></ItemList>

    <template>
        <p><b>{caption}</b></p>
        <p>
            <for let=item of=TODO key=item updates=TODO>
                <!-- 'bdone' must be in lowercase -->
                <if cond='item[1] == bdone'>
                    <label style="display: block">
                      <input type=checkbox @checked='item[1]'> 
                      {item[0]}
                    </label>
                </if>
            </for>
        </p>
    </template>
</component>

<!-- We create two component instances: one list of undone items: -->
<ItemList caption='To do:' #bDone=false></ItemList>

<!-- and one list of completed items: -->
<ItemList caption='Done:'  #bDone=true ></ItemList>

<!-- Adding an item -->
<p>
    New item (Enter):
    <br>
    <input type=text onchange="AddItem(this)">
</p>`;

const sampleRecursion=
`<component recursive>
    <ShowList #arg></ShowList>

    <style>
        .ShowList {
            display: flex; flex-wrap: wrap; align-items: center;
            background-color: goldenrod;
        }
        .ShowList > div {
            background-color: lemonchiffon;
            margin: 4px; padding: 8px; font-size: 18px;
        }
    </style>

    <template #arg>
        <if cond="Array.isArray(arg)">
            <then>
                <div class=ShowList>
                    <for let=item of=arg>
                        <div>
                            <!-- Recursive invocation -->
                            <ShowList #arg=item></ShowList>
                        </div>
                    </for>
                </div>
            </then>
            <else>
                {arg}
            </else>
        </if>
    </template>
</component>   

<define rvar=list 
  value="[1, [2,3], [4,[ ,[[42]]], 5, 'Otolift']]"
  store=sessionStorage
></define>

<p>
    JavaScript list: <input type=text @value="list" size=30>
</p>

<ShowList #arg="eval(list.V)"></ShowList>
<p>
    You can modify the JavaScript list above and see the result.
</p>`;

const sampleRedefineA =
`<component>
  <a href #target? ...rest><content></content></a>

  <template><a. #href="href"
    #target="!target && /^http/i.test(href) ? '_blank' : target"
    ...rest
    ><content>
  </content></a.></template>
</component>

This link opens in a blank window:
<a href="https://www.otolift.com/">Otolift Stairlifts</a>`;

const sampleA =
`<import src="OtoLib.html"><a></a></import>

<p>This link opens in a blank window:
<a href="https://www.otolift.com/">Otolift Stairlifts</a>

<p>This link navigates within the current window:
<a href="./#Introduction">Introduction</a>`;

const sampleTableMaker =
`<style>
td { text-align: center }
</style>

<component>
  <TableMaker datasource ...rest>
      <!-- One column header definition -->
      <HDef></HDef>
      <!-- One column detail definition -->
      <DDef item></DDef>
  </TableMaker>

  <template>
      <table. ...rest>
          <!-- Header row -->
          <tr.>
              <for of=HDef>
                  <th.><HDef></HDef></th.>
              </for>
          </tr.>
          <!-- Detail rows -->
          <for let=rec of='datasource'>
              <tr.>
                  <for of=DDef>
                      <td.><DDef #item=rec></DDef></td.>
                  </for>
              </tr.>
          </for>
      </table.>
  </template>
</component>

<!-- Some data -->
<script type=otoreact defines=tableData,thisYear>
  const tableData = [
      {name:'Piet',		year: 2004}, 
      {name:'Tine',	year: 2003},
  {name: 'Alex',	year: 1960}
  ];

  const thisYear = new Date().getFullYear();
</script>

<!-- The actual table definition, column by column: -->
<TableMaker #datasource='tableData' style="border-spacing: 20px 0px;">
  <!-- First column -->
  <HDef>Name</HDef>
  <DDef item>{item.name}</DDef>

  <!-- Second column -->
  <HDef>Birth year</HDef>
  <DDef item>{item.year}</DDef>

  <!-- Third column -->
  <HDef>Age</HDef>
  <DDef item>{thisYear -  item.year}</DDef>
</TableMaker>
`;

const sampleRHTML =
`<define rvar=sourcecode
        value="1 + 1 = <b>\\{1+1\\}</b>"
></define>
<textarea @value="sourcecode" rows=3 cols=50></textarea>
<p>
<RHTML #srctext=sourcecode.V></RHTML>
<p>
<RHTML>{srctext}</RHTML>`;

const sampleStyleTemplate =
`<def rvar=Hue value="0.0"></def>
<RSTYLE>
  h2 {
    color: hsl( \${Hue}deg 100% 50% );
  }
</RSTYLE>

<h2>Section head</h2>
Section contents
<h2>Another section head</h2>
<button onclick="Hue.V = (Math.random() * 360).toFixed(1)">Change hue</button>
Current hue is: {Hue}.`;

const C1=
`<!-- Component signature with parameter -->
<Repeat #count>
    <!-- Slot signature with parameter -->
    <content #num></content>
</Repeat>`,
C2 =
`<!-- Component template -->
<TEMPLATE #count=cnt>
    <FOR let=i  of="range(1, cnt)">
        <!-- Slot instance -->
        <content #num="i"></content>
    </FOR>
</TEMPLATE>`,
C3 =
`<!-- Component instance -->
<Repeat #count=7>
    <!-- Slot template -->
    <content #num>
        <p>This is <u>paragraph {num}</u>.</p>
    </content>
</Repeat>`,
C4 =
`<!-- Component instance and slot instance in one -->
<Repeat #count=7 #num>
    <p>This is <u>paragraph {num}</u>.</p>
</Repeat>`,

sampleComponent1 =
`<!-- Component definition -->
<COMPONENT>
${Indent(C1,4)}

${Indent(C2,4)}
</COMPONENT>

${C4}`;

const sampleFormatting =
`<style>
  dt {
    font-weight: bold
  }
</style>

<define var=today #value="new Date()"></define>
<dl>
    <dt>Internationalization API</dt>
    <script type=otoreact defines=dateFmt>
        const dateFmt = 
            new Intl.DateTimeFormat('en', 
                {day:'numeric', month: 'short'});
    </script>
    <dd>
        Today is {dateFmt.format(today)}.
    </dd>

    <dt>Day.js</dt>
    <script async src="demo/dayjs.min.js"></script>
    <dd>
        Today is {dayjs(today).format('MMM D')}.
    </dd>

    <dt>Standard Date methods</dt>
    <dd>
      Today is {today.toString().replace(/\\w+ (\\w+) 0*(\\d+) .*/, '$1 $2')}.
    </dd>
</dl>`

const sampleDocument = 
`<style>
h3 {color: green}
</style>
<def rvar=check #value="false"></def>

<document name=demoDoc ondestroy="demoDoc.closeAll()">
    <style> 
        label { display: block; margin: 30px }
    </style>
    <h3>This is a separate document.</h3>
    <label>
        <input type=checkbox @checked=check.V> Check me!
    </label>
</document>

Please click
<button onclick="
    demoDoc.open(''
        ,\`screenX=\${window.screenX + event.clientX},
        screenY=\${window.screenY + event.clientY + 200},
        width=250,height=120\`
        )"
>Pop up</button>
and note how the checkbox in the popup browser window is synchronized with the checkbox below.

<p>
<label>
    <input type=checkbox @checked=check.V> Checked.
</label>
<p>

Click <button onclick="demoDoc.print()">Print</button>
to open a print dialog for a document without showing it in a browser window`

const sampleRadioGroup=
`<component>
  <!-- Radiogroup signature -->
  <radiogroup name @value>
    <content>
      <radiobutton #value onclick? ...rest>
        <content></content>
      </radiobutton>
    </content>
  </radiogroup>

  <!-- Radiogroup template -->
  <template @value=groupValue>
    <content>
      <radiobutton #value onclick ...rest>
        <label style.cursor=pointer>
          <input type=radio #name=name #value=value
            #checked="value == groupValue.V"
            onclick="groupValue.V = value; onclick()" ...rest>
          <content></content>
        </label>
      </radiobutton>
    </content>
  </template>
</component>


<def rvar=answer></def>
<p>
  What's your preferred web framework?
</p>
<!-- Radiogroup instance -->
<radiogroup name=framework @value=answer.V>
  <radiobutton value=jQuery >jQuery</radiobutton>
  <radiobutton value=React  >React</radiobutton>
  <radiobutton value=Angular>Angular</radiobutton>
  <radiobutton value=OtoReact>OtoReact</radiobutton>
</radiogroup>

<p #if="answer">
  You answered <b>{answer}</b>.
</p>`

const demoRendering=
`<style>
  h5 {
    margin: 0px;
    padding: 4px 0px;
    border-top: solid 2px grey;
  }
  pre {
    white-space: pre-wrap;
    background-color: lightgrey;
  }
</style>

<h5>Editable RHTML source:</h5>
<def rvar=source store=sessionStorage value=
"<!-- Source code -->
<def var=x value=A></def>
<ul> <li> x = \\{x\\} </ul>
<comment> x = \\{x\\} </comment>"
></def>
<textarea rows=5 cols=50 @value=source></textarea>

<h5>Source DOM tree:</h5>
<def rvar=SourceDOM></def>
<div hidden #innerhtml=source 
    *+innerhtml= "SourceDOM.V"
></div>
<pre>{SourceDOM}</pre>

<h5>RHTML rendered output:</h5>
<def rvar=Result></def>
<rhtml oncreateupdate= "Result.V = this.shadowRoot.innerHTML"
>{source}</rhtml>

<h5>Created DOM tree:</h5>
<pre>{Result}</pre>`;

const demoScoping=
`(Look at the source code please)

<define var=A #value="10"></define>
<define var=F #value="(x) => A+x"></define>

<p>
    Now A = { A }, F(1) = { F(1) }
</p>

<p style="border: 1px solid; padding:1ex">
    <define var=A #value=20></define>
    Here we have a new A = {A}, but F still refers to the orinal A, so F(2) = {F(2)}
</p>

<p>Here A = {A} again.</p>`

const basicSetup =
`<!DOCTYPE html>
<html>
    <head>
        <meta charset="utf-8">
        <script type=module src="./OtoReact.js"></script>
    </head>
    <body hidden RHTML>
        <!-- Here goes your RHTML -->
        <FOR let=i of="range(5)">
            <div>Hello world {i}</div>
        </FOR>
    </body>
</html>`

const demoRadiogroup=
`<import src="OtoLib.html">
  <radiogroup></radiogroup>
</import>

<p>What's your favorite color?</p>

<def rvar="favColor"></def>
<radiogroup @value="favColor.V">
  <for let="C" of="['Red', 'Lime', 'SkyBlue', 'Pink']">
    <radiobutton #value="C">{C}</radiobutton>
  </for>
  <br>
  <radiobutton value="None">I don't have a favorite</radiobutton>
</radiogroup>

<case #value="favColor">
  <when match="None">
    <p>Oh, I'm sorry to hear that.</p>
  </when>
  <when match="{C}"> <!-- This binds the case-value to 'C' -->
    <p #style.backgroundcolor="C">Yes, {C.toLowerCase()} is a great color.</p>
  </when>
</case>`;

const demoCheckbox=
`<import src="OtoLib.html">
  <checkbox></checkbox>
</import>

<def rvar="check" #value="null"></def>

<checkbox @value="check.V">Click me</checkbox>,
or
<button onclick="check.V = null">Set to indeterminate</button>

<p>The checkbox value is: <code>{ \`\${check}\` }</code>`;

const demoTables =
`<style>
  * {
    text-align: center;
  }

  input {
    text-align: right;
    width: 8ex;
  }

  div.multi {
      display: flex; flex-wrap: wrap;
      gap: 2ex; 
      justify-content: center;
      margin: 1ex;
  }
</style>

<DEF rvar=maxY #value=6  store=sessionStorage></DEF>
<DEF rvar=maxX #value=10 store=sessionStorage></DEF>

<div class=multi>
  <label>Number of tables:
    <input type=number @valueAsNumber=maxY.V>
  </label>
  <label>Number of rows:
    <input type=number @valueAsNumber=maxX.V>
  </label>
</div>

<div class=multi>
  <FOR let=y of="range(1,maxY.V)">
      <div>
          <FOR let=x of="range(1,maxX.V)">
              <div>{x} x {y} = {x * y}</div>
          </FOR>
      </div>
  </FOR>
</div>`

const demoTwoWayRVAR = `
<style>
  input {
    display: block;
    width: 6em;
    margin: 4px 0px;
  }
</style>

<define rvar="data" #value="[ ]" store="sessionStorage"></define>

Please enter some numbers:
<for let="i" of="range(5)">
  <DEFINE RVAR="num" @VALUE="data[i]"></DEFINE>

  <input type="number" @valueasnumber="num.V">
</for>

<p>
  The sum is \{data.reduce((a,b)=>a+b,0)}
</p>`

const demoAutoSubscribtion = `
<p>
	<def rvar=a #value=0></def>
	<!-- Both these elements are auto-subscribed to a: -->
	<button onclick="a.V++">{a}</button>
	<span>a = {a}</span>
</p>

<p>
	<def rvar=b #value=0></def>
	<!-- Here only the <span> reacts on b: -->
	<button onclick="b.V++">{b}</button>
	<span>b = {b}</span>
</p>`

const demoLocalRstyles = 
`<component>
  <T color></T>

  <!-- This style sheet is local to the component but shared by all component instances -->
  <STYLE scope=local>
    span {background-color: azure; padding: 4px}
  </STYLE>

  <template color>
    <!-- Each component instance gets its own copy of this sheet.
    So it can refer to component parameter 'color'.  -->
    <RSTYLE scope=local>
      span { color: \${color} }
    </RSTYLE>

    <def rvar=n #value=2></def>
    <p>
      <button onclick="n.V++"> + </button>
      <for let=i of="range(1, n.V)">
        <span>{i}</span>
      </for>
    </p>
  </template>
</component>

<T color=red></T>
<T color=green></T>
<T color=blue></T>
<p>
  <span>The style sheets above do not apply to this <{}span>.</span>
<p>`

const demoModule =
`<import async src="/hi" defines="pi">
  <hi mark="?"></hi>
</import>

<hi></hi>

pi = {pi}

<module id="/hi">
  <component>
    <hi mark="!"></hi>
    <template>
      <p>Hi {mark}</p>
    </template>
  </component>

  <def var=pi #value="3.14"></def>
</module>`