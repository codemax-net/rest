/**
* 	Generic JSON rest JSL3 - extension
*	 	
*	version	: 1.1 
*	author	: dr. G.Metaxas
* 	Copyright 2020 Ambianti B.V.
* 	
*	Permission is hereby granted, free of charge, to any person obtaining a copy of this software and 
*	associated documentation files (the "Software"), to deal in the Software without restriction, 
*	including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, 
*	and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, 
*	subject to the following conditions:
*	
*	The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
*	
*	THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, 
*	INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. 
*	IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, 
*	WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE 
*	SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*	
*/
import fetch from 'node-fetch';
import { createRequire } from "module";
const require = createRequire(import.meta.url);

const restApiInit=require("./rest.js");
const jpath=require('@codemax/jpath');
const express=require('express');
const app=express();
app.use(express.text({limit: '50kb', type:'text/*'})); // for parsing text/plain 
app.use(express.json({limit: '4mb',strict:false})); // for parsing application/json 
app.use(express.urlencoded({limit: '4mb',extended:true}));

const FG_RESET 	='\x1b[0m';			
const FG_BLACK 	='\x1b[30m';	//BG 40,  bright fg 90  bright(gray) bg 100
const FG_RED	='\x1b[31m';
const FG_GREEN 	='\x1b[32m';
const FG_YELLOW	='\x1b[33m'	, FG_YELLOW_BRIGHT	='\x1b[93m';
const FG_BLUE  	='\x1b[34m'	, FG_BLUE_BRIGHT	='\x1b[94m';

async function asyncAssertTrue(title,fn){
	if(!fn){
		fn=title;
		title='';
	};
	console.log('');
	if(title){
		console.log(FG_YELLOW,title,FG_RESET);		
	};
	const ret=await fn();	
	if(!ret){
		console.log(FG_RED,'assertTrue',FG_RESET,fn.toString(), '\n',FG_RED,'failed',FG_RED,ret,FG_RESET);
		process.exit(-1);
	}else{
		console.log(FG_GREEN,'assertTrue',FG_RESET,fn.toString(), '\n',FG_GREEN,'passed',FG_YELLOW_BRIGHT, ret, FG_RESET);
	}
}

async function asyncAssertFalse(title,fn){
	if(!fn){
		fn=title;
		title='';
	};
	console.log('');
	if(title){
		console.log(FG_YELLOW,title,FG_RESET);		
	};
	const err=await fn();	
	if(err){
		console.log(FG_RED,'assertFalse',FG_RESET,fn.toString(), '\n',FG_RED,'failed',FG_RED,err,FG_RESET);
		process.exit(-1);
	}else{
		console.log(FG_GREEN,'assertFalse',FG_RESET,fn.toString(), '\n',FG_GREEN,'passed',FG_YELLOW_BRIGHT,err,FG_RESET);
	}
}

const colors_json={
	"red":{
		"id" :"red",
		"hex":"#ff0000",
		"rgb":[255,0,0],
		"hsl":[0,100,50]
	},
	"green":{
		"id" :"green",
		"hex":"#00ff00",
		"rgb":[0,255,0],
		"hsl":[120,100,50]
	},
	"blue":{
		"id" :"blue",
		"hex":"#0000ff",
		"rgb":[0,0,255],
		"hsl":[240,100,50]
	}
};

const storage=require('./storage/memory-storage.js')('colors.json',JSON.stringify(colors_json));

const initTestDatasetAPI=async function(){
	return await restApiInit(storage,{//data format
		'*':{
			id	:jpath.ID(),
			hex	:/^\#[0-9a-f]{6}$/,
			rgb :[jpath.limit(Number,0,255),jpath.limit(Number,0,255),jpath.limit(Number,0,255)],
			hsl :[jpath.limit(Number,0,360),jpath.limit(Number,0,100),jpath.limit(Number,0,100)]
		}
	});
};

const colorAPI=await initTestDatasetAPI();
app.use('/colors',colorAPI);

app.listen(3030);
console.log('Testing API');

//
await asyncAssertFalse('Testing get',async function(){	
	const response=await fetch( `http://localhost:3030/colors` ).then(res=>res.json());
	return jpath.valueTest(colors_json)(response);
});

await asyncAssertFalse('Testing GET with path',async function(){	
	const response=await fetch( `http://localhost:3030/colors/red` ).then(res=>res.json());
	return jpath.valueTest(colors_json.red)(response);
});

await asyncAssertFalse('Testing GET with filters',async function(){	
	const response=await fetch( `http://localhost:3030/colors?id=red&id=blue` ).then(res=>res.json());
	//console.log(response);
	return jpath.valueTest([colors_json.red,colors_json.blue])(response);
});


await asyncAssertFalse('Testing GET with filter',async function(){	
	const response=await fetch( `http://localhost:3030/colors?rgb=${encodeURIComponent('255,0,0')}` ).then(res=>res.json());
	//console.log(response);
	return jpath.valueTest([colors_json.red])(response);
});


//
await asyncAssertTrue('Testing PUT',async function(){	
	const response=await fetch( `http://localhost:3030/colors/red/description` ,{
		method	:'PUT',
		headers	:{'Content-Type': 'text/plain','Accept': 'application/json'},
		body	:'nice color'	
	}).then(res=>res.json());
	return response=='nice color';
});	

//
await asyncAssertFalse('Testing PUT with Prefer header, return=minimal',async function(){	
	const response=await fetch( `http://localhost:3030/colors/red/description` ,{
		method	:'PUT',
		headers	:{'Content-Type': 'text/plain','Prefer': 'return=minimal,foo,bar'},
		body	:'very nice color'	
	});
    return jpath.valueTest({
        status:204,
        location:'/colors/red/description',
    })({
        status:response.status,
        location:response.headers.get('location'),
    });
});	

//
await asyncAssertFalse('Testing POST',async function(){	
	const yellow={id:'yellow',hex:'#ffff00',rgb:[255,255,0],hsl:[60,100,50]};
	const response=await fetch( `http://localhost:3030/colors` ,{
		method	:'POST',
		headers	:{'Content-Type': 'application/json','Accept': 'application/json'},
		body	:JSON.stringify(yellow)
	}).then(res=>res.json());
	const colors=JSON.parse(await storage.loadData());
	return jpath.valueTest(colors.yellow)(yellow);
});

//
await asyncAssertTrue('Testing DELETE',async function(){	
	console.log(storage);
	const response=await fetch( `http://localhost:3030/colors/yellow` ,{method:'DELETE'});
	console.log(response.status,response.statusText);
	if(!response.status==204){
		return false;
	};
	const colors=JSON.parse(await storage.loadData());
	return colors.yellow===undefined;
});


//
await asyncAssertFalse('Testing PATCH',async function(){	
	const patch={
		description:'nice color',
		composition:'mostly red'
	};
	const res=await fetch( `http://localhost:3030/colors/red` ,{
		method	:'PATCH',
		headers	:{'Content-Type': 'application/json','Accept': 'application/json'},
		body	:JSON.stringify(patch)
	});
	if(res.ok){
		const result=await res.json();
		const colors=JSON.parse(await storage.loadData());
		console.log(result);
		return jpath.all(colors.red,patch)(result);
	}else{
		return res.message||(res.status + ' ' + res.statusText);
	};

});

await asyncAssertFalse('Testing PATCH with filter',async function(){	
	const patch={
		description:'very nice color',
		composition:'primary'
	};
	const res=await fetch( `http://localhost:3030/colors?id=red&id=green` ,{
		method	:'PATCH',
		headers	:{'Content-Type': 'application/json','Accept': 'application/json'},
		body	:JSON.stringify(patch)
	});
	if(res.ok){
		const result=await res.json();
		const colors=JSON.parse(await storage.loadData());
		console.log(result);
		return jpath.all([colors.red,colors.green],[,,patch])(result);	
	}else{
		return res.message||(res.status + ' ' + res.statusText);
	};
});

await asyncAssertFalse('Testing PATCH with multiple items',async function(){	
	const patch={
		'green':{rating:20},
		'red'  :{rating:10},
		'blue' :{rating:15}
	};
	const res=await fetch( `http://localhost:3030/colors` ,{
		method	:'PATCH',
		headers	:{'Content-Type': 'application/json','Accept': 'application/json'},
		body	:JSON.stringify(patch)
	});
	if(res.ok){
		const result=await res.json();
		const colors=JSON.parse(await storage.loadData());
		console.log(result);
		return jpath.all(colors,patch)(result);
	}else{
		return res.message||(res.status + ' ' + res.statusText);
	};
});

await asyncAssertFalse('Testing PATCH with request Prefer header return=minimal',async function(){	
	const patch={
		'green':{rating:20},
		'red'  :{rating:10},
		'blue' :{rating:15}
	};
	const res=await fetch( `http://localhost:3030/colors` ,{
		method	:'PATCH',
		headers	:{'Content-Type': 'application/json','Prefer': 'return=minimal,foo,bar'},
		body	:JSON.stringify(patch)
	});
	if(res.ok){
        const url=`http://localhost:3030${res.headers.get('location')}`;
		const result=await fetch(url).then(res=>res.json());
		const colors=JSON.parse(await storage.loadData());
		console.log(result);
		return jpath.all(colors,patch)(result);
	}else{
		return res.message||(res.status + ' ' + res.statusText);
	};
});


await asyncAssertFalse('Testing PATCH with multiple items(delete properties)',async function(){	
	const patch={
		'green':{rating:null},
		'red'  :{rating:null},
		'blue' :{rating:null}
	};
	const res=await fetch( `http://localhost:3030/colors` ,{
		method	:'PATCH',
		headers	:{'Content-Type': 'application/json','Accept': 'application/json'},
		body	:JSON.stringify(patch)
	});
	if(res.ok){
		const result=await res.json();
		const colors=JSON.parse(await storage.loadData());
		console.log(result);
		return jpath.all(colors,{
            '*':{
                rating:undefined
            }
        })(result);
	}else{
		return res.message||(res.status + ' ' + res.statusText);
	};
});


//
await asyncAssertTrue('Testing MOVE with json',async function(){	
	//should return 409 because red exists
	const res=await fetch( `http://localhost:3030/colors/green` ,{
		method	:'MOVE',
		headers	:{'Content-Type': 'application/json','Accept': 'application/json'},
		body	:JSON.stringify({id:'red'})
	});
	if(res.ok){
		const entity=await res.json();
		const colors=JSON.parse(await storage.loadData());
		console.log(entity);
		return colors.green || jpath.all(colors.lime,{id:'lime'})(entity);		
	}else{
		return res.message||(res.status + ' ' + res.statusText);
	};
});
await asyncAssertFalse('Testing MOVE with json',async function(){	
	const res=await fetch( `http://localhost:3030/colors/green` ,{
		method	:'MOVE',
		headers	:{'Content-Type': 'application/json','Accept': 'application/json'},
		body	:JSON.stringify({id:'lime'})
	});
	if(res.ok){
		const entity=await res.json();
		const colors=JSON.parse(await storage.loadData());
		console.log(entity);
		return colors.green || jpath.all(colors.lime,{id:'lime'})(entity);		
	}else{
		return res.message||(res.status + ' ' + res.statusText);
	};
});


//
await asyncAssertFalse('Testing MOVE with plain text',async function(){	
	//should return 409 because red exists
	const res=await fetch( `http://localhost:3030/colors/lime` ,{
		method	:'MOVE',
		headers	:{'Content-Type': 'text/plain','Accept': 'application/json'},
		body	:'green'
	});
	//console.log(res);
	if(res.ok){
		const entity=await res.json();
		const colors=JSON.parse(await storage.loadData());
		console.log(entity);
		return colors.lime || jpath.all(colors.green,{id:'green'})(entity);		
	}else{
		return res.message||(res.status + ' ' + res.statusText);
	};	
});

await asyncAssertTrue('Testing MOVE with plain text',async function(){	
	const res=await fetch( `http://localhost:3030/colors/red` ,{
		method	:'MOVE',
		headers	:{'Content-Type': 'text/plain','Accept': 'application/json'},
		body	:'green'
	});
	//console.log(res);
	if(res.ok){
		const entity=await res.json();
		const colors=JSON.parse(await storage.loadData());
		console.log(entity);
		return colors.lime || jpath.all(colors.green,{id:'green'})(entity);		
	}else{
		return res.message||(res.status + ' ' + res.statusText);
	};	
});


await asyncAssertTrue('Testing if-unmodified-since',async function(){	
	const res=await fetch( `http://localhost:3030/colors` ,{
		method	:'POST',
		headers	:{'Content-Type': 'application/json','Accept': 'application/json','If-Unmodified-Since':new Date(Date.now()-1000).toGMTString()},
		body	:JSON.stringify({
			"id" :"orange",
			"hex":"#ffa500",
			"rgb":[255,170,0],
			"hsl":[40,100,50]
		})
	});
	console.log(res.message||(res.status + ' ' + res.statusText));
	return res.status==412;
});
await asyncAssertTrue('Testing if-unmodified-since',async function(){	
	const res=await fetch( `http://localhost:3030/colors` ,{
		method	:'POST',
		headers	:{'Content-Type': 'application/json','Accept': 'application/json','If-Unmodified-Since':new Date(Date.now()+1000).toGMTString()},
		body	:JSON.stringify({
			"id" :"orange",
			"hex":"#ffa500",
			"rgb":[255,170,0],
			"hsl":[40,100,50]
		})
	});
	console.log(res.message||(res.status + ' ' + res.statusText));
	return res.ok;
});

await asyncAssertTrue('Testing if-unmodified-since',async function(){	
	const res=await fetch( `http://localhost:3030/colors/orange` ,{
		method	:'PATCH',
		headers	:{'Content-Type': 'application/json','Accept': 'application/json','If-Unmodified-Since':new Date(Date.now()-1000).toGMTString()},
		body	:JSON.stringify({
			description:"nice orange"
		})
	});
	console.log(res.message||(res.status + ' ' + res.statusText));
	return res.status==412;
});
await asyncAssertTrue('Testing if-unmodified-since',async function(){	
	const res=await fetch( `http://localhost:3030/colors/orange` ,{
		method	:'PATCH',
		headers	:{'Content-Type': 'application/json','Accept': 'application/json','If-Unmodified-Since':new Date(Date.now()+1000).toGMTString()},
		body	:JSON.stringify({
			description:"nice orange"
		})
	});
	console.log(res.message||(res.status + ' ' + res.statusText));
	return res.ok;
});

await asyncAssertTrue('Testing if-unmodified-since',async function(){	
	const res=await fetch( `http://localhost:3030/colors/orange/hex` ,{
		method	:'PUT',
		headers	:{'Content-Type': 'text/plain','Accept': 'application/json','If-Unmodified-Since':new Date(Date.now()-1000).toGMTString()},
		body	:"#ffaa00"
	});
	console.log(res.message||(res.status + ' ' + res.statusText));
	return res.status==412;
});
await asyncAssertTrue('Testing if-unmodified-since',async function(){	
	const res=await fetch( `http://localhost:3030/colors/orange/hex` ,{
		method	:'PUT',
		headers	:{'Content-Type': 'text/plain','Accept': 'application/json','If-Unmodified-Since':new Date(Date.now()+1000).toGMTString()},
		body	:"#ffaa00"
	});
	console.log(res.message||(res.status + ' ' + res.statusText));
	return res.ok;
});

await asyncAssertTrue('Testing if-unmodified-since',async function(){	
	const res=await fetch( `http://localhost:3030/colors/orange` ,{
		method	:'MOVE',
		headers	:{'Content-Type': 'text/plain','Accept': 'application/json','If-Unmodified-Since':new Date(Date.now()-1000).toGMTString()},
		body	:"oranje"
	});
	console.log(res.message||(res.status + ' ' + res.statusText));
	return res.status==412;
});
await asyncAssertTrue('Testing if-unmodified-since',async function(){	
	const res=await fetch( `http://localhost:3030/colors/orange` ,{
		method	:'MOVE',
		headers	:{'Content-Type': 'text/plain','Accept': 'application/json','If-Unmodified-Since':new Date(Date.now()+1000).toGMTString()},
		body	:"oranje"
	});
	console.log(res.message||(res.status + ' ' + res.statusText));
	return res.ok;
});

await asyncAssertTrue('Testing if-unmodified-since',async function(){	
	const res=await fetch( `http://localhost:3030/colors/orange` ,{
		method	:'DELETE',
		headers	:{'If-Unmodified-Since':new Date(Date.now()-1000).toGMTString()},
	});
	console.log(res.message||(res.status + ' ' + res.statusText));
	return res.status==412;
});
await asyncAssertTrue('Testing if-unmodified-since',async function(){	
	const res=await fetch( `http://localhost:3030/colors/orange` ,{
		method	:'DELETE',
		headers	:{'If-Unmodified-Since':new Date(Date.now()+1000).toGMTString()},
	});
	console.log(res.message||(res.status + ' ' + res.statusText));
	return res.ok;
});

process.exit(0);