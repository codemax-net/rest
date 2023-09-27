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


/**
	Generic JSON based RESTful backend
*/

const express = require('express');
const jpath = require('@codemax/jpath');

/**
	workarround for google cloud balancer/nginx bug(?) of stripping away the response status phrase
		we set also a dedicated x header (x-status-phrase) with the status-phrase so that we can safely pass the message to the client
*/
const writeStatusAndHeaders=(res,code,phrase,headers)=>{
	//console.log(code,typeof phrase);
	if(typeof phrase == 'string'){
		headers=Object.assign({},headers,{'x-status-phrase':phrase})
	};
	res.writeHead(code,phrase,headers);
	return res;
}
const logRequest=(req,...rest)=>{
	return;
	console.log({method:req.method,url:req.url,path:req.path,params:req.params,query:req.query,originalUrl:req.originalUrl});
	console.log(...rest);
}

const makeJsonRestService=function(fileStorage,dataset,datasetValidator,rootPath){/**
		Generates a REST service based on the provided file storage, data set, and validator.
		@param fileStorage		A file storage abstraction as described in './storage.js'	
		@param dataset 			The initial dataset
		@param datasetValidator	Validator function of the form (value)=>dataOk?0:'error string' , or alternatively a jpath value test pattern		
		@return an object(not an express router) which implements the CRUD REST operations based on the provided dataset
	*/
	var backupDataset=structuredClone(dataset);
	//internal utility functions
	const validate=function(throwError){/**
			Validates the currest state of the dataset, 
			@param throwError when true raise an error if the datasetValidator finds the dataset invalid
			@return the error generated by the datasetValidator 
		*/
		const error=datasetValidator(dataset,'dataset');
		if(throwError && error){
			throw new Error(error);
		};
		return !error;
	};
	const load=async function(){/**
			Loads the dataset from the fileStorage assuming they are a valid JSON object
			If the data are not valid, an error is thrown
			@return The new dataset
		*/
		const data=await fileStorage.loadData();
		if(data){
			dataset=JSON.parse(data);
			validate(true);
		};
		return dataset;
	};
	const save=async function(metadata=undefined){/**
			Attempts to save the data to the file storage.
			*note the fileStorage is responsible to raise an error with code 412 if the file was modified by another process
		*/
		await fileStorage.saveData(JSON.stringify(dataset),true,metadata);
	};
	const backup=function(){/**
			make a structured clone of the dataset, so that we can recover in case of an error during a transaction(CRUD operation)
		*/
		backupDataset=structuredClone(dataset);
	};
	const recover=async function(error,res){/**
			Used internally to recover from an error after an unsuccesful transaction(CRUD operation).
				-In the special case that the error is a 412 (i.e. the file version was modified by another process/service)
					we reload the data from the fileStorage
				-In all other cases (i.e. the data failed to validate, or some internal exception is thrown)
					we restore the data previously saved by backup()
		*/
		console.log('recovering from error:',error.code,error.message);		
		if(error.code==412){//precondition failed, aka the file was modified by another process
			await load();
			writeStatusAndHeaders(res,412,error.message).end();
		}else{//data validation conflict
			dataset=backupDataset;
			writeStatusAndHeaders(res,409,error.message).end();
		};		
	};
	
	const getPathAndQuery=(req,temp)=>({
		path :((rootPath||'')+(req.path=='/'?'':req.path)).split('/').filter((x,i)=>i||x).map(x=>decodeURIComponent(x)),
		query:!(temp=Object.entries(req.query)).length?null:Object.fromEntries(
			temp.map(e=>[e[0], Array.isArray(e[1])?jpath.either(...e[1]):e[1] ])
		)
	});
	
	const getMetadata=(req)=>{
		const metadata={method:req.method,path:req.path};
		const queryStr=JSON.stringify(req.query);
		metadata.query=queryStr.length>2?queryStr:'';
		metadata.user=req.user?req.user.id:'';
		return metadata;
	}
	
	//REST methods
	const router=express.Router();
	router.get('*',async function get(req,res,next){/*
			when no query string is provided, a single item identified solely by the url path is returned,
			when a query string is provided by the request, it is used as filter and the method returns the list of matching items
		*/
		await load();
		const {path,query}=getPathAndQuery(req);
		const dest =path.reduce( (root,resName)=>root && resName && root[resName], dataset );
		logRequest(req,{path,query,dest});

		if(!dest){
			writeStatusAndHeaders(res,404,'Not Found').end();
		}else
		if(!req.accepts('application/json')){
			writeStatusAndHeaders(res,406, 'Not Acceptable',{'content-type':'text/plain'});
			res.write('application/json');
			res.end();
		}else{
			try{
				if(req.method=='HEAD'){
					writeStatusAndHeaders(res,200,{'content-type':'application/json'}).end();	
				}else{
					if(query){
						//console.log(query);
						res.send(Object.values(dest).filter(jpath.valueFilter(query)));
					}else{
						res.send(dest);	
					}					
				};
			}catch(error){
				console.log(error);
				writeStatusAndHeaders(res,500,'Internal Server Error').end();
			}
		};
	});
	
	router.delete('*',async function deleteFn(req,res){/**
			As defined in the rfc https://www.rfc-editor.org/rfc/rfc9110#section-9.3.5
			The DELETE method requests that the origin server remove the association between the target resource and its current functionality. 
			In effect, this method is similar to the "rm" command in UNIX.
		*/
		const {path,query}=getPathAndQuery(req);
		let last =path.pop();
		let part =path.slice();
		let dest =path.reduce((root,resName,i)=>(part[i]=root) && resName && root[resName],dataset);
		logRequest(req,{path,query,dest,last,part});
		if(query){
			writeStatusAndHeaders(res,400, 'Bad request').end();
			return;
		}else
		if(!dest){
			writeStatusAndHeaders(res,404, 'Not Found').end();
			return;
		};
		try{
			backup();
			try{
				do{
					delete dest[last];	
					if(Object.keys(dest).length){
						break;
					}else{
						dest=part.pop();
						last=path.pop();
					};
				}while((dest!=undefined) && (last!=undefined));	
				validate('invalid data');				
				await save(getMetadata(req));
				writeStatusAndHeaders(res,204).end();
			}catch(error){
				await recover(error,res);
			}
		}catch(error){
			console.log(error);
			writeStatusAndHeaders(res,500, error.message).end();//we assume that authorized users can see error.message		
		}
	});
	router.put('*',async function put(req,res){/**
			As defined in the rfc https://www.rfc-editor.org/rfc/rfc9110#section-9.3.4 
				The PUT method requests that the state of the target resource be created or replaced 
				with the state defined by the representation enclosed in the request message content. 
			
		*/
		const {path,query}=getPathAndQuery(req);		
		//convert the path to a designator so that we can set dest[last]=req
		const last = path.pop();
		//"target resource be created or replaced..." thus if root[resName] doesn't exist we created it.
		const dest = last && path.reduce( (root,resName)=>root && resName && (root[resName]||={}),dataset);
		//the designator is dest[last] ;-)
		logRequest(req,{path,query,dest,last});		
		const replaceDataset=!rootPath && !last && !dest && !query && !path.length;
		if(query){
			writeStatusAndHeaders(res,400, 'Bad request').end();
			return;
		}else
		if(!dest && !replaceDataset){//404 Not Found
			writeStatusAndHeaders(res,404, 'Not Found').end();
		}else
		if(!req.accepts('application/json')){//406 Not Acceptable, say to the client we can only respond with application/json
			writeStatusAndHeaders(res,406, 'Not Acceptable',{'content-type':'text/plain'});
			res.write('application/json');
			res.end();
		}else
		if(!(req.is('text/plain') || req.is('application/json'))){//415 Unsupported Media Type
			writeStatusAndHeaders(res,415, 'Unsupported Media Type',{'accept': 'application/json'}).end();	
		}else{
			try{
				//console.log('PUT',{dest,last,body:req.body});
				const statusCode=(dest && Object.hasOwn(dest,last))?200:201;			
				backup();
				try{
					if(replaceDataset){
						dataset=req.body;
					}else{
						dest[last]=req.body;
					};
					validate('invalid data');
					await save(getMetadata(req));
					res.status(statusCode).json(replaceDataset?dataset:dest[last]);//return dest[last] because validate might change the data
				}catch(error){
					await recover(error,res);
				}
			}catch(error){
				console.log(error);
				writeStatusAndHeaders(res,500, error.message).end();//we assume that authorized users can see the error.message		
			}
		};
	});
	router.post('*',async function post(req,res){/**
		As defined in https://www.rfc-editor.org/rfc/rfc9110#section-9.3.3
		The POST method requests that the target resource process the representation enclosed in the request according to the resource's own specific semantics. 
			...Creating a new resource that has yet to be identified by the origin server and 
			...Appending data to a resource's existing representation(s).
		
		We expect the designator to be an array
			If the posted item has an "id", we check it for uniquenesss before appending the item in the designator array.
	*/
		const {path,query}=getPathAndQuery(req);
		const dest =path.reduce( (root,resName)=>root && resName && root[resName], dataset);
		logRequest(req,{path,query,dest,body:req.body});
		if(query){
			writeStatusAndHeaders(res,400, 'Bad request').end();
			return;
		}else
		if(!dest){//404 Not Found
			writeStatusAndHeaders(res,404, 'Not Found').end();
		}else
		if(!req.accepts('application/json')){//406 Not Acceptable
			writeStatusAndHeaders(res,406, 'Not Acceptable',{'content-type':'text/plain'});
			res.write('application/json');
			res.end();
		}else
		if(!(req.is('text/plain') || req.is('application/json'))){//415 Unsupported Media Type
			writeStatusAndHeaders(res,415, 'Unsupported Media Type',{'accept': 'application/json'}).end();	
		}else{
			if(!Array.isArray(dest)){//405 Method Not Allowed
				if(!Object.hasOwn(req.body,'id')){//409 Conflict
					writeStatusAndHeaders(res,409, 'The entity must have an id').end();
					return;					
				}else
				if(Object.hasOwn(dest,req.body.id)){//409 Conflict
					writeStatusAndHeaders(res,409, 'A resource with this id already exists',{'content-type':'application/json'});
					res.write(JSON.stringify(dest[req.body.id]));
					res.end();
					return;	
				};
			};			
			try{
				backup();
				try{
					if(Array.isArray(dest)){
						dest.push(req.body);	
					}else{
						dest[req.body.id]=req.body;
					};
					validate('invalid data');
					await save(getMetadata(req));
					res.status(201).json(dest[req.body.id]);//return dest[req.body.id] instead of req.body, because the validation might change the data (who knows...)
				}catch(error){
					await recover(error,res);
				}
			}catch(error){
				console.log(error);
				writeStatusAndHeaders(res,500, error.message).end();//we assume that authorized users can see the error.message		
			}	
		}
	});
	
	const patchObjectProps=(obj,props)=>{
		for(let k in props){
			const p=props[k],q=obj[k];
			if(p && q && (typeof p == 'object') && (typeof q== 'object')){
				patchObjectProps(q,p);
			}else
            if(p==null){
                delete obj[k];
            }else{
				obj[k]=p;
			};
		}
	};
	
	router.patch('*',async function patch(req,res){/**
			patches one or more items
			when no query string is provided a single item identified solely by the url path is patched,
				and the method returns the updated item data
			when a query string is provided by the request it is used as filter to identify the designators
				and the method returns the array of the afftected items data
		*/
		const {path,query}=getPathAndQuery(req);
		const dest =path.reduce( (root,resName)=>root && resName && root[resName], dataset);
		logRequest(req,{path,query,dest});
		//console.log('dest array found:',dest && Array.isArray(dest),'dest is ',tableName,'=',dest==table);
		if(!dest){//404 Not Found
			writeStatusAndHeaders(res,404, 'Not Found').end();
		}else
		if(!req.accepts('application/json')){//406 Not Acceptable
			writeStatusAndHeaders(res,406, 'Not Acceptable',{'content-type':'text/plain'});
			res.write('application/json');
			res.end();
		}else
		if(!(req.is('text/plain') || req.is('application/json'))){//415 Unsupported Media Type
			writeStatusAndHeaders(res,415, 'Unsupported Media Type',{'accept': 'application/json'}).end();	
		}else{
			//console.log('patch',req.query);
			try{
				const items=query?Object.values(dest).filter(jpath.valueFilter(query)):null;
				backup();
				try{
					if(items){//we are patching multiple of items 
						items.forEach(item=>Object.assign(item,req.body));
					}else{//we are patching the destination object
						//Object.assign(dest,req.body);
						patchObjectProps(dest,req.body);
					};
					validate('invalid data');
					await save(getMetadata(req));
					res.status(200).json(items||dest);//return the affected item(s) after the patch
				}catch(error){
					await recover(error,res);
				}
			}catch(error){
				console.log(error);
				writeStatusAndHeaders(res,500, error.message).end();//we assume that authorized users can see the error.message		
			}	
		}
	});
	router.move('*',async function move(req,res){/**
			Non-standard
				change the "id" of the resource
			
		*/
		//we must use the original request url because express seems to decode the uri components and then apply the regEx
		const {path,query}=getPathAndQuery(req);
		const last =path.pop();		
		const dest =path.reduce( (root,resName)=>root && resName && root[resName], dataset);
		logRequest(req,{path,query,dest});
		if(!dest){//404 Not Found
			writeStatusAndHeaders(res,404, 'Not Found');  
			res.end();
		}else
		if(!req.accepts('application/json')){//406 Not Acceptable, say to the client we can only respond with application/json
			writeStatusAndHeaders(res,406, 'Not Acceptable',{'content-type':'text/plain'});res.write('application/json');
			res.end();
		}else
		if(!(req.is('text/plain') || req.is('application/json'))){//415 Unsupported Media Type
			writeStatusAndHeaders(res,415, 'Unsupported Media Type',{'accept': 'application/json;text/plain'});
			res.end();	
		}else{
			const newId=(typeof req.body == 'string')?req.body:req.body.id;
			if(!newId){//409 Conflict
				writeStatusAndHeaders(res,409, 'New entity id must be specified').end();
				return;					
			}else
			if(Array.isArray(dest)){//405 Method Not Allowed
				writeStatusAndHeaders(res,405, 'Method not allowed').end();
				return;				
			}else
			if(Object.hasOwn(dest,newId)){//409 Conflict
				writeStatusAndHeaders(res,409, 'A resource with this id already exists',{'content-type':'application/json'});
				res.write(JSON.stringify(dest[newId]));
				res.end();
				return;	
			};	
			try{
				backup();
				try{
					if(req.body.id){
						dest[dest[last].id=newId]=dest[last];	
					}else{
						dest[newId]=dest[last];//we assume that the validator will fix the id property of the destination as needed
					};
					delete dest[last];
					validate('invalid data');
					await save(getMetadata(req));
					res.status(200).json(dest[newId]);
				}catch(error){
					await recover(error,res);
				}
			}catch(error){
				console.log(error);
				writeStatusAndHeaders(res,500, error.message);//we assume that authorized users can see the error.message		
				res.end();
			}
		};
	});
	
	router.load=load;
	router.validate=validate;
	router.save=save;
	return router;//{validate,load,save,get,head,put,post,patch,move,delete:delete_};
};
	
module.exports=async function(fileStorage,datasetValidator,rootPath=''){/**
		@param fileStorage	a file storage abstraction as described in './storage.js'	
		@param datasetValidator	dataset validator function of the form (value)=>dataOk?0:'error string' , or alternatively a jpath value test pattern
		@return returns the REST service for the dataset
	*/
	datasetValidator=jpath.valueTest(datasetValidator);//if the provided datasetValidator is a function then keep it, otherwise treat it as a jpath value test
	const dataset=JSON.parse(await fileStorage.loadData());		
	const error=datasetValidator(dataset);
	if(!error){
		console.log('dataset',fileStorage.name,'contains valid data');
	}else{
		console.log('dataset',fileStorage.name,'contains INVALID data!');		
		console.error(error);
	};
	//console.log(dataset);
	return makeJsonRestService(fileStorage,dataset,datasetValidator,rootPath);
}	
