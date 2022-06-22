const sampleGreeting=
`<!-- Create a local reactive variable (RVAR) to receive the entered name -->
<DEFINE rvar='yourName'></DEFINE>

<p>
    What's your name?
    <!-- The value of the RVAR ('yourName.V') is bound to the value of the input element -->
    <input type=text @value="yourName.V">
</p>

<!-- If yourName.V is nonempty, -->
<IF #cond="yourName.V">
    <!-- then we show: -->
    <p>
        Nice to meet you, {yourName.V}. <!-- yourName.V is inserted here -->
        <br>By the way, your name consists of {yourName.V.length} characters.
    </p>
</IF>`
  , fileTemplate = 
`<!DOCTYPE html>
<html>
    <head>
        <script type=module src="OtoReact.js"></script>
    </head>
    <body hidden type=rhtml>

        <!-- Here goes your RHTML -->

    </body>
</html>
`;

const sampleServerData2=
`<!-- We tell OtoReact to define these names in global scope. -->
<script type=otoreact defines="ColorTable,toHex,handle,StartStop" >

// Here we store the data as an Array<{name:string, red:number, green:number, blue:number}>
const ColorTable = RVAR( null,
  /* Asynchronously fetch the data.
    When the data has been received, the RVAR will be updated and the table will be drawn.
   */
  RFetch("webColors.json").then(response => response.json())
);

/* Utility for 2-digit hex code */
function toHex(n){ 
  return n.toString(16).toUpperCase().padStart(2,'0');
}

/* Rotation */
let handle=RVAR();

function StartStop() {
  handle.V =
    ( handle.V
    ? clearInterval(handle.V)
    // Modify the data array every 330ms; the DOM table will automatically be updated accordingly.
    : setInterval( () => ColorTable.U.push(ColorTable.V.shift()) , 330)
    );
}
</script>

<!-- Styling -->
<style>
  table.colorTable td {
    padding: 0px 4px;
    text-align: center;
    max-width: 8em; overflow:hidden;
    font-size: small;
  }
</style>

<div style="height:100ex; width:100%; overflow-y:scroll;">
<!-- Now we build our table.
    The dots behind tag names are needed because HTML does not allow <FOR> as a child of <TABLE>.
    OtoReact removes these dots.
-->
<table. class=colorTable style.margin="auto">

  <!-- Table caption -->
  <caption.>Web Colors 
    <button onclick="StartStop();" reacton=handle style="float:right; width:5em">
        {handle.V ? 'Stop' : 'Rotate'}
    </button>
  </caption.>

  <!-- Column headers -->
  <tr.>
    <th.>Name</th.>
    <th.>R</th.> <th.>G</th.> <th.>B</th.>
    <th.>Hex</th.>
  </tr.>

  <!-- Detail records -->
  <FOR let=C #of="ColorTable.V" hash=C reacton=ColorTable>
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

</table.>
</div>`;

const sampleBraces =
`1 + 1 = {1 + 1}  \\{ Check this }
<p>
Null and undefined are not shown: "{null} {undefined}".
<br>
Compare this JavaScript template literal: { \`"\${null} \${undefined}"\` }.
<p>
Tag <{}br> looks better in source code than &lt;br&gt;`;

const sampleGreeting2 =
`<!-- Create a "Reactive variable" with a local name and
   persisted in localStorage -->
<define rvar='yourName' store=sessionStorage></define>

<p>What's your name?
  <input type=text @value="yourName.V">
  <!-- The "@" introduces a two-way binding for the input element.
  Anytime an input event happens, 'yourName.V' will be updated, and the DOM as well  -->
</p>
<if #cond="yourName.V">
  <p> Nice to meet you, {yourName.V}.
    <br>By the way, your name consists of {yourName.V.length} 
        characters.
  </p>
</if>`;

const sampleSqrt=
`<define rvar=x #value=2></define>
<p  title="sqrt({x.V}) = {Math.sqrt(x.V)}"
>
    What is sqrt({x.V})? Check the tooltip.
</p>
<button onclick="x.V += 1">Increment</button>`;

const sampleInlineStyles=
`<p style.backgroundColor=lightgrey> Light grey </p>

<define var=color value="red"></define>
<p #style.backgroundColor="color"> Colored </p>

<define var=myStyle 
  #value="{color: 'blue',fontStyle: 'italic'}"
></define>
<p +style="myStyle">My style</p>`;

const sampleParticipants=
`<!-- Here we use a local RVAR -->
<define rvar=Participants #value="['Joe', 'Mary', 'Eileen']"></define>

<b>Participants:</b>
<ul>
    <for let=participant #of="Participants.V">
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
`<script type=otoreact defines=AddItem>
    // Define the data model of our todo list
    let TODO = RVAR('TODO',
        [['Visit Joe', true], ['Fishing',false], ['Sleeping',false]]
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
    <itemlist caption bDone></itemlist>

    <template>
        <p><b>{caption}</b></p>
        <p>
            <for let=item #of=TODO.V #key=item #reacton=TODO reactive>
                <!-- 'bdone' must be in lowercase -->
                <if #cond='item[1] == bdone'>
                    <label style="display: block">
                      <input type=checkbox @checked='item.U[1]'> 
                      {item[0]}
                    </label>
                </if>
            </for>
        </p>
    </template>
</component>

<!-- Now we create two instances: one list of undone items and one list of completed items -->
<itemlist caption='To do:' #bDone=false></itemlist>
<itemlist caption='Done:'  #bDone=true ></itemlist>

<!-- Adding an item -->
<p>
    New item (Enter):
    <br>
    <input type=text onchange="AddItem(this)">
</p>`;

const sampleRecursion=
`<component recursive>
  <showList #arg></showList>

  <style>
      .showList {
          display: flex; flex-wrap: wrap; align-items: center;
          background-color: gray;
      }
      .showList > div {
          background-color: #f1f1f1;
          margin: 4px; padding: 8px; font-size: 18px;
      }
  </style>

  <template>
      <case>
          <when #cond="Array.isArray(arg)">
              <div class=showList>
                  <for let=item #of=arg>
                      <div>
                          <!-- Recursive invocation -->
                          <showList #arg=item></showList>
                      </div>
                  </for>
              </div>
          </when>
          <else>
              {arg}
          </else>
      </case>
  </template>
</component>   

<define rvar=list 
    value="[1, [2,3], [4,[41,[[[42]]]], 5], 'Otolift']"
    store=sessionStorage
></define>
<p>JavaScript list: <input type=text @value="list.V" size=35></p>
<showList #arg="eval(list.V)"></showList>
<p>You can modify the list definition above and see the result.</p>`;

const sampleRedefineA =
`<component>
  <a href #target? ...rest><contents></contents></a>

  <template><a. #href="href"
    #target="!target && /^http/i.test(href) ? '_blank' : target"
    ...rest
    ><contents>
  </contents></a.></template>
</component>

This link opens in a blank window:
<a href="https://www.otolift.com/">Otolift Stairlifts</a>`;

const sampleA =
`<import src=" OtoLib.html"><a></a></import>

<p>This link opens in a blank window:
<a href="https://www.otolift.com/">Otolift Stairlifts</a>

<p>This link navigates within the current window:
<a href="./#Introduction">Introduction</a>`;

const sampleTableMaker =
`<component>
    <TABLEMAKER datasource ...rest>
        <!-- One column header definition -->
        <HDEF></HDEF>
        <!-- One column detail definition -->
        <DDEF item></DDEF>
    </TABLEMAKER>

    <template>
        <table. ...rest>
            <!-- Header row -->
            <tr.>
                <for of=HDEF>
                    <th.><HDEF></HDEF></th.>
                </for>
            </tr.>
            <!-- Detail rows -->
            <for let=rec #of='datasource'>
                <tr.>
                    <for of=DDEF>
                        <td.><DDEF #item=rec></DDEF></td.>
                    </for>
                </tr.>
            </for>
        </table.>
    </template>
</component>

<!-- Some data -->
<script type=otoreact defines=tableData>
    const tableData = [
        {name:'Piet', age:18}, 
        {name:'Tine', age:19}
    ];
</script>

<!-- Now the actual table definition: -->
<tablemaker #datasource='tableData'>
    <!-- First column -->
    <HDEF>Naam</HDEF>
    <DDEF item>{item.name}</DDEF>

    <!-- Second column -->
    <HDEF>Leeftijd</HDEF>
    <DDEF item>{item.age}</DDEF>
</tablemaker>`;

const sampleTicTacToe = 
`<!-- By using a local script, multiple instances of this game will have their own state -->
<script type="otoreact/local" 
  defines="board,toMove,outcome,ClearAll,Move,CheckWinner"
>
    let
      board =    RVAR(),           // State of the board
      toMove =   RVAR(null, '✕'), // Player to move: '◯' or '✕'
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

<!-- Styles are global; we must use a class to restrict these rules to the current demo -->
<style>
    div.tic-tac-toe {
        display:grid; grid-template-columns: auto 120pt;
        background-color: white;
    }
    .tic-tac-toe table {
        width: fit-content; margin:1ex
    }
    .tic-tac-toe td {
        height:4ex; width: 4ex; padding: 0px;
        border: 2px solid; line-height: 1;
        text-align: center; vertical-align: middle;
    }
    .tic-tac-toe button {
        font-size: 80%;
    }
</style>

<div class=tic-tac-toe>
  <!-- Caption -->
  <div style="grid-column: 1/3; text-align: center;">
    <b>Tic-Tac-Toe</b>
  </div>

  <!-- Show the board -->
  <table. reacton=board>
          <!-- This table should react on the RVAR 'board'. -->
    <for let=row #of="board.V">
      <tr.>
        <for let=cell #of="row" reacting>
          <td. onclick="Move(cell)"
           >{cell.P}</td.>
        </for>
      </tr.>
    </for>
  </table.>
  <!-- Show either the outcome, or the player to move -->
  <div>
    <p reacton=outcome,toMove>
      <case>
        <when #cond="outcome.V===true">
          <b>It's a draw.</b>
        </when>
        <when #cond="outcome.V">
          <b>The winner is: <large>{outcome.V}</large></b>
        </when>
        <else>
          Player to move: {toMove.V}
        </else>
      </case>
    </p>
    <button onclick="ClearAll()">Clear</button>
  </div>
</div>`;

const sampleRHTML =
`<define rvar=sourcecode 
        value="1 + 1 = <b>\\{1+1}</b>"
></define>
<textarea @value="sourcecode.V" rows=3 cols=30></textarea>
<br>
<RHTML #srctext=sourcecode.V></RHTML>`;

const sampleStyleTemplate =
`<def rvar=Hue #value="Math.random()*360"></def>

<style. reacton=Hue>
  h2 \\{ color: hsl( {Hue.V}, 100%, 50%) \\}
</style.>

<h2>Section 1</h2>
Contents
<h2>Section 2</h2>

<button onclick="Hue.V = Math.random()*360">
  Random color
</button>`;

const C1=
`  <!-- Component signature with parameter -->
  <repeat #count>
    <!-- Slot signature with parameter -->
    <contents #num></contents>
  </repeat>`,
C2 =
`  <!-- Component template -->
  <TEMPLATE>
    <for let=i #of="range(1,count)">
        <!-- Slot instance -->
        <contents #num="i"></contents>
    </for>
  </TEMPLATE>`,
C3 =
`<!-- Component instance -->
<repeat #count=7>
  <!-- Slot template -->
  <contents #num>
    <p>This is <u>paragraph {num}</u>.</p>
  </contents>
</repeat>`,
C4 =
`<!-- Component instance and slot instance in one -->
<repeat #count=7 #num>
    <p>This is <u>paragraph {num}</u>.</p>
</repeat>`,

sampleComponent1 =
`<!-- Component definition -->
<COMPONENT>
${C1}

${C2}
</COMPONENT>


${C4}`;

const sampleFormatting =
`<define var=today #value="new Date()"></define>
<style>dt {font-weight:bold}</style>
<dl>
    <dt>Internationalization API</dt>
    <script>
        globalThis.dateFmt = 
            new Intl.DateTimeFormat('en', 
                {day:'numeric', month: 'short'});
    </script>
    <dd>
        Today is {dateFmt.format(today)}.
    </dd>

    <dt>Day.js</dt>
    <script async src="./dayjs.min.js"></script>
    <dd>
        Today is {dayjs(today).format('MMM D')}.
    </dd>
</dl>`

const sampleDocument = 
`<def rvar=check #value="false"></def>

<document name=showCheck>
    <h4>This is a separate document.</h4>
    <label reacton=check style="display: block; margin: 30px">
        <input type=checkbox @checked=check.V> Check me!
    </label>
</document>

<button onclick="
    showCheck.open(''
        ,\`screenX=\${window.screenX + event.clientX - 100},
        screenY=\${window.screenY + event.clientY + 200},
        width=250,height=120\`
        )"
>Pop up</button>

<label reacton=check>
    <input type=checkbox @checked=check.V> Checked.
</label>
<p>
<button onclick="showCheck.print()">Print</button>`

const sampleRadioGroup=
`<component>
    <!-- Radiogroup signature -->
  <radiogroup name @value>
    <contents>
      <radiobutton #value onclick? ...rest>
        <contents></contents>
      </radiobutton>
    </contents>
  </radiogroup>

  <template @value=groupValue>
    <contents>
      <radiobutton #value onclick ...rest>
        <label style.cursor=pointer>
          <input type=radio #name=name #value=value
            #checked="value == groupValue.V"
            onclick="groupValue.V = value; onclick()" ...rest>
          <contents></contents>
        </label>
      </radiobutton>
    </contents>
  </template>
</component>


<def rvar=answer></def>
<p>
  What is your preferred web framework?
</p>
<!-- Radiogroup instance -->
<radiogroup name=framework @value=answer.V>
  <radiobutton value=jQuery >jQuery</radiobutton>
  <radiobutton value=React  >React</radiobutton>
  <radiobutton value=Angular>Angular</radiobutton>
  <radiobutton value=OtoReact>OtoReact</radiobutton>
</radiogroup>

<p #if="answer.V">
  You answered <b>{answer.V}</b>.
</p>`

const demoRendering=
`<style>
h5 {margin: 0px; padding: 4px 0px;
   border-top: solid 2px grey}
pre {background-color: lightgrey}
</style>

<h5>RHTML source:</h5>
<def rvar=source store=localStorage value=
"<def var=x value=A></def>
<ul> <li> x = \\{x} </ul>
"></def>
<textarea rows=5 cols=50 @value=source.V></textarea>

<h5>HTML rendering:</h5>
<def rvar=html></def>
<div #innerhtml=source.V 
    *+innerHTML= "html.V"
></div>

<h5>Parsed HTML:</h5>
<pre reacton=html>{html.V}</pre>

<h5>RHTML rendering:</h5>
<def rvar=rhtml></def>
<rhtml #srctext=source.V
  oncreateupdate= "rhtml.V = this.shadowRoot.innerHTML"
></rhtml>

<h5>Created DOM:</h5>
<pre reacton=rhtml>{rhtml.V}</pre>`;

const demoScoping=
`(Look at the source code please)

<define var=A #value="10"></define>
<define var=F #value="(x) => A+x"></define>

<p>
    Now A = { A }, F(1) = { F(1) }
</p>

<p style="border: 1px solid; padding:2px">
    <define var=A #value=20></define>
    Here we have a new A = {A}, but F still refers to the orinal A, so F(2) = {F(2)}
</p>

<p>Here A = {A} again.</p>`

const basicSetup =
`<!DOCTYPE html>
<html>
    <head>
        <script type=module>
            import {RCompile} from './OtoReact.js';
            RCompile(document.body)
        </script>
    </head>
    <body hidden>
        <!-- Here goes your RHTML -->
        <FOR let=i #of="range(5)">
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
  <for let="C" #of="['Red', 'Lime', 'SkyBlue', 'Pink']">
    <radiobutton #value="C">{C}</radiobutton>
  </for>
  <br>
  <radiobutton value="None">I don't have a favorite</radiobutton>
</radiogroup>

<case #value="favColor.V">
  <when match="None">
    <p>Oh, I'm sorry to hear that.</p>
  </when>
  <when match="{C}"> <!-- This binds the case-value to 'C' -->
    <p #style.backgroundcolor="C">Yes, {C.toLowerCase()} is a great color.</p>
  </when>
</case>`;

const demoCheckbox=
`<import src="OtoLib.html"><checkbox></checkbox></import>

<def rvar="check" #value="null"></def>

<checkbox @value="check.V">Click me</checkbox>
<br>
<button onclick="check.V = null">Set to indeterminate</button>

 <p>The checkbox value is: <code>{ \`\${check.V}\` }</code>`;

const demoTables =
`<style>
  *     { text-align: center; }
  input { text-align: right; width: 8ex; }

  div.multi {
      display: flex; flex-wrap: wrap;
      gap: 2ex; justify-content: center;
      margin: 1ex;
  }
</style>

<DEF rvar=maxY #value=7  store=sessionStorage></DEF>
<DEF rvar=maxX #value=10 store=sessionStorage></DEF>

<div class=multi>
  <div>Number of tables:
    <input type=number @valueAsNumber=maxY.V>
  </div>
  <div>Number of rows:
    <input type=number @valueAsNumber=maxX.V>
  </div>
</div>

<div class=multi>
  <FOR let=y #of="range(1,maxY.V)">
      <div>
          <FOR let=x #of="range(1,maxX.V)">
              <div>{x} x {y} = {x * y}</div>
          </FOR>
      </div>
  </FOR>
</div>`