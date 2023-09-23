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
	wrapper for google storage file (or any other storage e.g. local file system)	
*/
const googleStorage = new (require('@google-cloud/storage').Storage)();
const gcsBucket	= googleStorage.bucket(process.env.GOOGLE_CLOUD_PROJECT+'.appspot.com');

console.log('bucket in use:',process.env.GOOGLE_CLOUD_PROJECT+'.appspot.com');
/**
	file storage wrapper for google storage files
	@path 	relative file path 
	@return Object with two methods loadData and writeData
*/
function getFileStorage(path){
	const file=gcsBucket.file(path);
	//override get to check the etag
	const _requestStream=file.requestStream;
	file.requestStream=function(reqOpts,...args){
		reqOpts.headers||={};
		reqOpts.headers['if-none-match']=file.metadata.etag||'';
		//console.log(reqOpts);
		return _requestStream.call(file,reqOpts,...args);
	};	
	
	/**
		read the file data and extract the metadata available in the headers
		@return a Buffer with the file data if the file was modified, null if the file has the same etag, undefined if the file doesn't exist
	*/
	const loadData=async()=>{
		const stream=file.createReadStream()
			.on('response', function(response) {
				const {statusCode,headers}=response;
				if(statusCode==200){
					file.metadata||={};
					file.metadata.generation	=headers['x-goog-generation'];
					file.metadata.contentType	=headers['content-type'];
					file.metadata.size			=Number(headers['x-goog-stored-content-length']);
					file.metadata.metageneration=headers['x-goog-metageneration'];
					file.metadata.storageClass	=headers['x-goog-storage-class'];
					file.metadata.etag			=headers['etag'];
				}else
				if(statusCode==304){
					//console.log(file.name,'not modified');
				}
			});
		try{
			const buffer=await file.getBufferFromReadable(stream);
			return buffer;			
		}catch(error){
			switch(error.code){
				case 304: return null;
				case 404: return undefined;
				default : throw error;
			}
		}
	}
	/**
		Save data to the file, and update its metadata. 
		If the "ifGenerationMatch" flag is set then make a request with this precondition 		
	*/
	const saveData=async(data,ifGenerationMatch=true,metadataFields=undefined)=>{
		let options=ifGenerationMatch?{
			preconditionOpts:{
				ifGenerationMatch: (typeof ifGenerationMatch == 'number')?ifGenerationMatch:file.metadata.generation
			}	
		}:undefined;
		if(metadataFields){
			Object.assign(options=options||{},{metadata:{metadata:Object.assign(metadataFields)}});
		};
		return await file.save(data,options);		
	};
	
	return ({
			loadData,
			saveData,
			get metadata(){
				return file.metadata
			},
			get name(){
				return path;
			}
	});
};
module.exports=getFileStorage;
