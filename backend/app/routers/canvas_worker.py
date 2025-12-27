
from app.models.canvas_models import CanvasThing, RAGStatus
from app.services.rag_service import rag_service

async def handle_async_vectorization(thing_id: str, file_path: str, canvas_id: str):
    """
    Wrapper for RAG ingestion that updates Thing status.
    Runs in background task.
    """
    # Create a new DB session for the background task
    from app.core.database import SessionLocal
    db = SessionLocal()
    
    try:
        thing = db.query(CanvasThing).filter(CanvasThing.id == thing_id).first()
        if not thing:
            print(f"[CanvasWorker] Thing {thing_id} not found during async vectorization.")
            return

        thing.rag_status = RAGStatus.PROCESSING
        db.commit()
        
        print(f"[CanvasWorker] Processing vectorization for thing {thing_id}...")
        
        # Branch based on type
        # For Documents: Ingest file directly
        # For Images: Use VLM to generate description, then ingest text
        
        result = None
        
        if thing.type.value == "image":
             print(f"[CanvasWorker] Processing Image Thing using VLM...")
             from app.services.vision_service import vision_service
             import base64
             
             # 1. Read the image file
             try:
                 with open(file_path, "rb") as img_file:
                     image_data = base64.b64encode(img_file.read()).decode('utf-8')
                     
                 # 2. Get Vision Model preference
                 vision_model = thing.content.get("vision_model", "default")
                 print(f"[CanvasWorker] Using Vision Model: {vision_model}")
                 
                 # 3. Analyze
                 description = await vision_service.analyze(
                     image_data=image_data,
                     prompt="Describe this image in detail. Focus on visual elements, text content, and any diagrams or charts. This description will be used for search and retrieval.",
                     model_name=vision_model
                 )
                 
                 print(f"[CanvasWorker] VLM Description generated ({len(description)} chars).")
                 
                 # 4. Save description to Thing Content
                 # Need to ensure we don't overwrite other content fields unexpectedly, 
                 # but 'content' is a JSON field, so we can update it.
                 # SQLAlchemy explicit update for JSON fields often needs a fresh copy or flag_modified
                 # But here we are in a session.
                 thing.content["description"] = description
                 # flag_modified(thing, "content") # If needed, but usually dict update works if we re-assign or use specific method
                 # Creating a new dict to ensure SQLAlchemy detects change
                 new_content = dict(thing.content)
                 new_content["description"] = description
                 thing.content = new_content
                 
                 from sqlalchemy.orm.attributes import flag_modified
                 flag_modified(thing, "content")
                 
                 db.commit()
                 
                 # Verify persistence immediately
                 db.expire(thing) 
                 db.refresh(thing)
                 print(f"[CanvasWorker] Content committed and refreshed. Keys: {thing.content.keys()}")
                 if "description" not in thing.content:
                     print("[CanvasWorker] CRITICAL FAILURE: Description not found after commit!")
                 
                 # 5. Ingest Description into RAG
                 result = rag_service.ingest_text(
                     description,
                     metadata={"canvas_id": canvas_id, "thing_id": thing_id, "type": "image_description", "source_image": file_path}
                 )
                 
             except Exception as ve:
                 print(f"[CanvasWorker] VLM Analysis Failed: {ve}")
                 thing.rag_status = RAGStatus.FAILED
                 db.commit()
                 return

        elif thing.type.value == "slideshow":
            print(f"[CanvasWorker] Ingesting Slideshow...")
            
            # Progress Callback
            def update_progress(current, total):
                try:
                    # We need to re-query or just use the current object if valid
                    # But since we might incur overhead, let's just update content
                    # We use a fresh dict to ensure SA detects change
                    
                    # Refreshing 'thing' in loop might be heavy? 
                    # Actually, 'thing' is attached to session 'db'. 
                    
                    # Note: We should probably only commit every N items to save DB IO if total is huge
                    # But for now, 1 commit per slide is fine (human speed).
                    
                    new_content = dict(thing.content)
                    new_content["ingestion_progress"] = {
                        "current": current,
                        "total": total,
                        "percent": int((current / total) * 100)
                    }
                    thing.content = new_content
                    
                    from sqlalchemy.orm.attributes import flag_modified
                    flag_modified(thing, "content")
                    db.commit()
                except Exception as e:
                    print(f"[CanvasWorker] Error updating progress: {e}")

            # Slideshows have a sidecar JSON, which ingest_slideshow handles.
            # Metadata: Include canvas_id and thing_id to fix RAG Search filtering.
            # CRITICAL: Run in threadpool to prevent blocking the async event loop!
            from starlette.concurrency import run_in_threadpool
            
            result = await run_in_threadpool(
                rag_service.ingest_slideshow,
                file_path,
                metadata={"canvas_id": canvas_id, "thing_id": thing_id, "asset_id": thing.content.get("asset_id")},
                progress_callback=update_progress
            )

        else:
            # Default Document Ingestion
            result = rag_service.ingest_file(
                file_path, 
                metadata={"canvas_id": canvas_id, "thing_id": thing_id}
            )
            
            if result.get("status") == "success":
                # Save extracted text to Thing for display (if available)
                if "full_text" in result:
                    print(f"[CanvasWorker] Saving extracted text to Thing {thing_id} ({len(result['full_text'])} chars)...")
                    new_content = dict(thing.content)
                    new_content["text_content"] = result["full_text"]
                    thing.content = new_content
                    
                    from sqlalchemy.orm.attributes import flag_modified
                    flag_modified(thing, "content")
                    db.commit()
            
            # Check for "Scanned PDF" (Low text density)
            if result.get("status") == "success":
                text_len = result.get("text_length", 0)
                doc_count = result.get("doc_count", 1)
                
                # Heuristic: < 50 chars per page on average implies scanned/image-only
                if doc_count > 0 and (text_len / doc_count) < 50:
                     print(f"[CanvasWorker] Low text density detected ({text_len} chars for {doc_count} pages). Switching to Scanned PDF Mode (VLM)...")
                     
                     from app.services.vision_service import vision_service
                     from app.services.pdf_service import pdf_service
                     
                     try:
                         # 1. Convert to images
                         images = pdf_service.convert_pdf_to_images(file_path)
                         print(f"[CanvasWorker] Rendered {len(images)} pages from PDF.")
                         
                         # 2. Transcribe each page
                         # Reuse vision model setting if available, else default
                         vision_model = thing.content.get("vision_model", "default")
                         
                         full_description = []
                         for i, img_b64 in enumerate(images):
                             print(f"[CanvasWorker] Transcribing Page {i+1}/{len(images)}...")
                             page_desc = await vision_service.analyze(
                                 image_data=img_b64,
                                 prompt=f"Transcribe all text on this page exactly. Also describe any diagrams, tables, or images in detail. (Page {i+1})",
                                 model_name=vision_model
                             )
                             full_description.append(f"--- Page {i+1} ---\n{page_desc}")
                             
                         combined_text = "\n\n".join(full_description)
                         print(f"[CanvasWorker] Scanned PDF Transcription Complete ({len(combined_text)} chars).")
                         
                         # Save transcription to content for frontend display
                         new_content = dict(thing.content)
                         new_content["generated_description"] = combined_text
                         thing.content = new_content
                         
                         from sqlalchemy.orm.attributes import flag_modified
                         flag_modified(thing, "content")
                         
                         db.commit()
                         print(f"[CanvasWorker] Scanned PDF content committed. Keys: {new_content.keys()}")
                         
                         # 3. Re-ingest as text (Appending to index)
                         # We might want to remove the sparse nodes from the first attempt, 
                         # but RAG usually handles redundancy fine. 
                         # Ideally we would delete them, but for now we append the high-quality transcription.
                         result = rag_service.ingest_text(
                             combined_text,
                             metadata={"canvas_id": canvas_id, "thing_id": thing_id, "type": "scanned_pdf_transcription", "source": file_path}
                         )
                         
                     except Exception as se:
                         print(f"[CanvasWorker] Scanned PDF Fallback Failed: {se}")
                         # Mark as failed so user knows VLM ingestion failed
                         result = {"status": "failed", "error": str(se)}
                         print("[CanvasWorker] Marking result as FAILED due to VLM error.")
        
        # Reload thing 
        thing = db.query(CanvasThing).filter(CanvasThing.id == thing_id).first()
        print(f"[CanvasWorker] Reloaded thing {thing_id}. Content keys: {thing.content.keys() if thing and thing.content else 'None'}")
        
        if result and result.get("status") == "success":
            thing.rag_status = RAGStatus.COMPLETED
            print(f"[CanvasWorker] Vectorization COMPLETED for thing {thing_id}")
        else:
            # Check if it was "no_documents_found" or error
            thing.rag_status = RAGStatus.FAILED
            print(f"[CanvasWorker] Vectorization ENDED with status: {result.get('status')}")

        db.commit()
        
    except Exception as e:
        print(f"[CanvasWorker] Critical error in vectorization task: {e}")
        try:
           thing = db.query(CanvasThing).filter(CanvasThing.id == thing_id).first()
           if thing:
               thing.rag_status = RAGStatus.FAILED
               db.commit()
        except:
            pass
    finally:
        db.close()
