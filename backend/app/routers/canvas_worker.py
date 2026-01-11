from app.models.canvas_models import CanvasThing, Canvas, RAGStatus
from app.services.rag_service import rag_service

async def handle_async_vectorization(
    thing_id: str, 
    file_path: str, 
    canvas_id: str, 
    mode: str = "initial", 
    active_batch_id: str = None
):
    """
    Wrapper for RAG ingestion that updates Thing status.
    Runs in background task.
    
    Args:
        mode: "initial" or "sync". Sync triggers 2-phase cleanup.
        active_batch_id: Unique ID for this specific ingestion batch, used for cleanup.
    """
    # Create a new DB session for the background task
    from app.core.database import SessionLocal
    db = SessionLocal()
    
    try:
        thing = db.query(CanvasThing).filter(CanvasThing.id == thing_id).first()
        if not thing:
            print(f"[CanvasWorker] Thing {thing_id} not found during async vectorization.")
            return

        # Resolve Canvas Configuration (Model)
        canvas_model = "default"
        try:
            canvas = db.query(Canvas).filter(Canvas.id == canvas_id).first()
            if canvas and canvas.owner_config:
                 print(f"[CanvasWorker] DEBUG OWNER CONFIG: {canvas.owner_config}")
                 print(f"[CanvasWorker] DEBUG OWNER CONFIG KEYS: {list(canvas.owner_config.keys())}")
                 # Check common keys for model selection
                 canvas_model = (
                     canvas.owner_config.get("selectedModel") or 
                     canvas.owner_config.get("model") or 
                     "default"
                 )
                 # Resolve Vision Model preference
                 # Frontend usually stores this in 'visionModel' or similar
                 canvas_vision_model = (
                      canvas.owner_config.get("visionModel") or
                      canvas.owner_config.get("selectedVisionModel") or
                      canvas.owner_config.get("vision_model") or
                      canvas_model
                 )
            
            print(f"[CanvasWorker] Using Canvas Model: {canvas_model}, Vision: {canvas_vision_model}")
        except Exception as e:
            print(f"[CanvasWorker] Warning: Failed to resolve canvas model: {e}")
            canvas_vision_model = "default"
        except Exception as e:
            print(f"[CanvasWorker] Warning: Failed to resolve canvas model: {e}")

        thing.rag_status = RAGStatus.PROCESSING
        db.commit()
        
        print(f"[CanvasWorker] Processing vectorization for thing {thing_id} (Mode: {mode})...")
        
        # Base metadata for all RAG items
        base_metadata = {
            "canvas_id": canvas_id, 
            "thing_id": thing_id
        }
        if active_batch_id:
            base_metadata["ingestion_batch_id"] = active_batch_id
        
        result = None
        
        # Generic Progress Callback
        def update_progress(current, total):
            try:
                # We reuse the same logic for all types
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

        if thing.type.value == "image":
             print(f"[CanvasWorker] Processing Image Thing using VLM...")
             from app.services.vision_service import vision_service
             import base64
             
             # 1. Read the image file
             try:
                 with open(file_path, "rb") as img_file:
                     image_data = base64.b64encode(img_file.read()).decode('utf-8')
                     
                 # 2. Get Vision Model preference
                 vision_model = thing.content.get("vision_model", canvas_vision_model)
                 print(f"[CanvasWorker] Using Vision Model: {vision_model}")
                 
                 # 3. Analyze
                 description = await vision_service.analyze(
                     image_data=image_data,
                     prompt="Describe this image in detail. Focus on visual elements, text content, and any diagrams or charts. This description will be used for search and retrieval.",
                     model_name=vision_model
                 )
                 
                 print(f"[CanvasWorker] VLM Description generated ({len(description)} chars).")
                 
                 # 4. Save description to Thing Content
                 thing.content["description"] = description
                 
                 new_content = dict(thing.content)
                 new_content["description"] = description
                 thing.content = new_content
                 
                 from sqlalchemy.orm.attributes import flag_modified
                 flag_modified(thing, "content")
                 
                 db.commit()
                 
                 # Verify persistence immediately
                 db.expire(thing) 
                 db.refresh(thing)
                 
                 # 5. Ingest Description into RAG
                 meta = base_metadata.copy()
                 meta.update({"type": "image_description", "source_image": file_path})
                 
                 result = rag_service.ingest_text(
                     description,
                     metadata=meta
                 )
                 
             except Exception as ve:
                 print(f"[CanvasWorker] VLM Analysis Failed: {ve}")
                 thing.rag_status = RAGStatus.FAILED
                 db.commit()
                 return




        elif thing.type.value == "slideshow":
            print(f"[CanvasWorker] Processing Slideshow... ThingID={thing_id}")
            source_type = thing.content.get("source_type", "pptx")
            print(f"[CanvasWorker] Slideshow Source Type: {source_type}")
            
            if source_type == "image_folder":
                 # ==========================================================
                 # 1. Image-Based Slideshow (Folder of Images)
                 # ==========================================================
                 print(f"[CanvasWorker] PROCESSING IMAGE FOLDER SLIDESHOW MODE")
                 from app.services.vision_service import vision_service
                 from app.models.asset_models import Asset
                 from app.services.asset_service import STORAGE_ROOT
                 import base64
                 import asyncio
                 from PIL import Image
                 import io

                 slides = thing.content.get("slides", [])
                 total_slides = len(slides)
                 print(f"[CanvasWorker] Found {total_slides} slides to analyze.")
                 
                 slides_done = 0
                 
                 update_progress(0, total_slides)
                 
                 full_transcription = []
                 
                 
                 # Concurrency for VLM
                 # STRICT SERIAL EXECUTION for Local Models (Ollama)
                 # Parallel requests cause VRAM starvation and "garbage" output (loops).
                 semaphore = asyncio.Semaphore(1)
                 # semaphore = asyncio.Semaphore(3) # Too aggressive for local
                 
                 # Pre-fetch paths to avoid DB issues in async loop
                 slide_paths = {}
                 for slide in slides:
                     aid = slide.get("image_asset_id")
                     if aid:
                         asset = db.query(Asset).filter(Asset.id == aid).first()
                         if asset:
                             full_path = STORAGE_ROOT / asset.file_path
                             if full_path.exists():
                                 slide_paths[aid] = str(full_path)
                             else:
                                 print(f"[CanvasWorker] Asset file missing: {full_path}")
                         else:
                             print(f"[CanvasWorker] Asset record not found for: {aid}")
                 
                 print(f"[CanvasWorker] Resolved {len(slide_paths)} image paths.")

                 async def analyze_slide_image(i, slide):
                     nonlocal slides_done
                     async with semaphore:
                         aid = slide.get("image_asset_id")
                         path = slide_paths.get(aid)
                         
                         if not path:
                             print(f"[CanvasWorker] Slide {i} SKIPPED (No Path). Asset: {aid}")
                             slide["ai_description"] = "Image file not found."
                             slides_done += 1
                             update_progress(slides_done, total_slides)
                             return

                         try:
                             print(f"[CanvasWorker] Analyzing Slide {i+1} at {path}...")
                             
                             # Resize and Optimize Image for VLM
                             img_bytes = io.BytesIO()
                             with Image.open(path) as img:
                                 # Ensure we have a white background for transparency
                                 # (Standard PIL convert('RGB') from RGBA turns transparent pixels BLACK, 
                                 # which makes black text unreadable)
                                 if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
                                     img = img.convert('RGBA')
                                     background = Image.new('RGB', img.size, (255, 255, 255))
                                     background.paste(img, mask=img.split()[3]) # 3 is the alpha channel
                                     img = background
                                 else:
                                     img = img.convert('RGB')
                                     
                                 # Resize to max 1024px (Best stability for Llama 3.2 Vision)
                                 max_dim = 1024
                                 if max(img.size) > max_dim:
                                     img.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)
                                 
                                 # High quality info for text reading
                                 img.save(img_bytes, format='JPEG', quality=95)
                             
                             b64_data = base64.b64encode(img_bytes.getvalue()).decode('utf-8')
                             
                             vision_model = thing.content.get("vision_model", "default")
                             # Improved Prompt for Optical Character Recognition + Summary
                             prompt_text = (
                                 "Identify the main title and key points in this slide. Summarize the content."
                             )
                             
                             try:
                                 desc = await asyncio.wait_for(
                                     vision_service.analyze(
                                         image_data=b64_data,
                                         prompt=prompt_text,
                                         model_name=vision_model
                                     ),
                                     timeout=120.0
                                 )
                             except asyncio.TimeoutError:
                                 print(f"[CanvasWorker] VLM Timeout Slide {i+1}")
                                 desc = "(Analysis timed out)"
                             except Exception as ve:
                                 print(f"[CanvasWorker] VLM Error Slide {i+1}: {ve}")
                                 desc =f"(Analysis failed: {ve})"
                             
                             # Fallback for repetitive loops
                             # Case 1: Many repeated words ("word word word")
                             words = desc.split()
                             is_repetitive = False
                             if len(words) > 20:
                                 unique_ratio = len(set(words)) / len(words)
                                 if unique_ratio < 0.2:
                                     is_repetitive = True
                             
                             # Case 2: Single long nonsense word ("RefreshRefreshRefresh")
                             if len(desc) > 100 and len(words) < 5:
                                 is_repetitive = True

                             if is_repetitive:
                                 desc = "(Analysis failed: Model produced repetitive output. Please retry.)"
                                 
                             slide["ai_description"] = desc
                             full_transcription.append(f"--- Slide {i+1} ---\n{desc}")
                             print(f"[CanvasWorker] Slide {i+1} Analyzed. Length: {len(desc)}")
                             
                         except Exception as e:
                             print(f"[CanvasWorker] VLM Error Slide {i}: {e}")
                             slide["ai_description"] = f"Analysis failed: {e}"
                         
                         slides_done += 1
                         update_progress(slides_done, total_slides)

                 # Run Parallel VLM
                 if total_slides > 0:
                    tasks = [analyze_slide_image(i, slide) for i, slide in enumerate(slides)]
                    await asyncio.gather(*tasks)
                 
                 # Update Content
                 new_content = dict(thing.content)
                 new_content["slides"] = slides # Updated with ai_description
                 
                 # Save aggregated text for RAG
                 combined_text = "\n\n".join(full_transcription)
                 new_content["generated_description"] = combined_text # Store for display/debugging
                 print(f"[CanvasWorker] Saving updated content. Combined Text Len: {len(combined_text)}")
                 
                 thing.content = new_content
                 from sqlalchemy.orm.attributes import flag_modified
                 flag_modified(thing, "content")
                 db.commit()
                 
                 print(f"[CanvasWorker] Ingesting VLM Slideshow Text into RAG...")
                 meta = base_metadata.copy()
                 meta.update({"type": "slideshow_images"})
                 result = rag_service.ingest_text(
                     combined_text,
                     metadata=meta
                 )
                 print(f"[CanvasWorker] Image Slideshow Processing COMPLETE.")

            else:
                # ==========================================================
                # 2. Standard PPTX Slideshow (Sidecar JSON)
                # ==========================================================
                
                # Phase 2: AI Slide Analysis
                # We want to populate the 'ai_description' field in the sidecar JSON so the frontend can display it.
                json_path = f"{file_path}.json"
                import os
                import json
                from app.services.llm_service import llm_service
                from app.models.chat import Message
                
                if os.path.exists(json_path):
                    print(f"[CanvasWorker] Found sidecar JSON at {json_path}. Starting AI Analysis (Parallel)...")
                    try:
                        import asyncio
                        with open(json_path, "r") as f:
                            presentation_data = json.load(f)
                        
                        slides = presentation_data.get("slides", [])
                        total_slides = len(slides)
                        slides_done = 0
                        
                        # Initialize progress
                        update_progress(0, total_slides)
                        
                        # Prepare semaphore for concurrency
                        concurrency_limit = 3
                        
                        # Check for sequential processing preference in default LLM preset
                        from app.services.config_service import config_service
                        default_preset = config_service.get_default_llm_preset()
                        if default_preset and default_preset.get("is_sequential"):
                            concurrency_limit = 1
                            print(f"[CanvasWorker] Using sequential processing (concurrency=1) as configured.")
                        else:
                            print(f"[CanvasWorker] Using parallel processing (concurrency={concurrency_limit}).")

                        semaphore = asyncio.Semaphore(concurrency_limit)
                        
                        async def process_slide_ai(i, slide):
                            nonlocal slides_done
                            async with semaphore:
                                # Skip if already analyzed
                                if slide.get("ai_description"): 
                                    slides_done += 1
                                    update_progress(slides_done, total_slides)
                                    return False

                                # Construct prompt
                                elements_desc = []
                                for el in slide.get("elements", []):
                                    text = el.get("text", "").strip()
                                    shape = el.get("shape_kind", el.get("type", "UNKNOWN"))
                                    if text:
                                        elements_desc.append(f"- {shape}: \"{text}\"")
                                    else:
                                        elements_desc.append(f"- {shape} (Visual element)")
                                
                                if not elements_desc:
                                    slide["ai_description"] = "Empty slide."
                                    slides_done += 1
                                    update_progress(slides_done, total_slides)
                                    return True

                                slide_content = "\n".join(elements_desc[:20]) # Limit to first 20 elements to save context
                                
                                prompt = f"""
                                Analyze this PowerPoint slide (Slide {i+1}).
                                Describe its key message in 1 sentence.
                                
                                Content:
                                {slide_content}
                                """
                                
                                try:
                                    print(f"[CanvasWorker] Requesting AI analysis for Slide {i+1}...")
                                    response = await asyncio.wait_for(
                                        llm_service.chat([Message(role="user", content=prompt)], model_name=canvas_model),
                                        timeout=120.0
                                    )
                                    slide["ai_description"] = response.strip()
                                    print(f"[CanvasWorker] Slide {i+1} Analyzed.")
                                except asyncio.TimeoutError:
                                    print(f"[CanvasWorker] LLM Timeout Slide {i+1}")
                                    slide["ai_description"] = "(Analysis timed out)"
                                except Exception as le:
                                    print(f"[CanvasWorker] LLM Error Slide {i+1}: {le}")
                                    slide["ai_description"] = "Analysis unavailable."
                                
                                slides_done += 1
                                update_progress(slides_done, total_slides)
                                return True

                        # Run all slides in parallel with semaphore
                        tasks = [process_slide_ai(i, slide) for i, slide in enumerate(slides)]
                        results = await asyncio.gather(*tasks)
                        
                        # Fix: Always sync if we have valid slides, even if cached (results all False)
                        if slides:
                            if any(results): # Only write file if changed
                                with open(json_path, "w") as f:
                                    json.dump(presentation_data, f)
                                print(f"[CanvasWorker] Updated sidecar JSON with AI descriptions.")
                            
                            # CRITICAL FIX: Also update the DB Thing Content so frontend sees the analysis!
                            import time
                            print(f"[CanvasWorker] Syncing analyzed slides to DB for Thing {thing_id}...")
                            new_content = dict(thing.content)
                            new_content["slides"] = slides # slides list now has 'ai_description' populated
                            new_content["_analysis_timestamp"] = time.time() # Force change detection
                            thing.content = new_content
                            
                            from sqlalchemy.orm.attributes import flag_modified
                            flag_modified(thing, "content")
                            db.commit()
                            print(f"[CanvasWorker] DB sync complete.")
                            
                    except Exception as e:
                        print(f"[CanvasWorker] Error during AI Slide Analysis: {e}")
                else:
                    print(f"[CanvasWorker] Sidecar JSON not found. Skipping AI Analysis.")

                print(f"[CanvasWorker] Ingesting Slideshow into RAG...")
                
                # Metadata: Include canvas_id and thing_id to fix RAG Search filtering.
                meta = base_metadata.copy()
                meta.update({"asset_id": thing.content.get("asset_id")})
                
                # CRITICAL: Run in threadpool to prevent blocking the async event loop!
                from starlette.concurrency import run_in_threadpool
                
                result = await run_in_threadpool(
                    rag_service.ingest_slideshow,
                    file_path,
                    metadata=meta,
                    progress_callback=update_progress
                )

        else:
            # Default Document Ingestion
            meta = base_metadata.copy()
            # CRITICAL FIX: Include asset_id so chat can filter by it if needed in future
            if thing.content.get("asset_id"):
                meta["asset_id"] = thing.content.get("asset_id")
            
            result = rag_service.ingest_file(
                file_path, 
                progress_callback=update_progress,
                model_name=canvas_model,
                enable_vision=False # CanvasWorker handles vision with UI progress updates
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
            # CRITICAL FIX: Only run this on actual PDF files!
            if result.get("status") == "success" and file_path.lower().endswith(".pdf"):
                text_len = result.get("text_length", 0)
                doc_count = result.get("doc_count", 1) # Default to 1 to avoid div by zero
                
                if doc_count <= 0: doc_count = 1
                
                avg_chars_per_page = text_len / doc_count
                print(f"[CanvasWorker] PDF Text Analysis: {text_len} chars over {doc_count} pages. Avg: {avg_chars_per_page:.2f} chars/page.")
                
                # Heuristic: < 50 chars per page on average implies scanned/image-only
                # User report: "Normal" PDF triggering this. Lowering threshold to < 50 might be too aggressive if PDF has strict layout?
                # Actually 50 chars is very low (basically empty). 
                # If it triggered, then LlamaIndex likely failed to extract text (maybe encryption or weird encoding).
                # Let's keep 50 but ADD LOGGING to see why it thinks it's empty. 
                if avg_chars_per_page < 50:
                     print(f"[CanvasWorker] Low text density detected (<50). Switching to Scanned PDF Mode (VLM)...")
                     
                     from app.services.vision_service import vision_service
                     from app.services.pdf_service import pdf_service
                     
                     try:
                         import asyncio
                         # 1. Convert to images
                         images = pdf_service.convert_pdf_to_images(file_path)
                         print(f"[CanvasWorker] Rendered {len(images)} pages from PDF.")
                         
                         # 2. Transcribe each page
                         # Reuse vision model setting if available, else default
                         vision_model = thing.content.get("vision_model", canvas_vision_model)
                         
                         full_description = []
                         total_pages = len(images)
                         
                         for i, img_b64 in enumerate(images):
                             print(f"[CanvasWorker] Transcribing Page {i+1}/{len(images)}...")
                             update_progress(i, total_pages) 
                             
                             try:
                                 # 120 second timeout for VLM per page
                                 page_desc = await asyncio.wait_for(
                                     vision_service.analyze(
                                         image_data=img_b64,
                                         prompt=f"Transcribe all text on this page exactly. Also describe any diagrams, tables, or images in detail. (Page {i+1})",
                                         model_name=vision_model
                                     ),
                                     timeout=120.0
                                 )
                             except asyncio.TimeoutError:
                                 print(f"[CanvasWorker] VLM Timeout on Page {i+1}")
                                 page_desc = "(Analysis timed out for this page)"
                             except Exception as e:
                                 print(f"[CanvasWorker] VLM Error on Page {i+1}: {e}")
                                 page_desc = f"(Analysis failed: {e})"

                             if not page_desc or not page_desc.strip():
                                 page_desc = "(No text content returned from Vision Model)"
                             
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
                         meta = base_metadata.copy()
                         meta.update({"type": "scanned_pdf_transcription", "source": file_path})
                         result = rag_service.ingest_text(
                             combined_text,
                             metadata=meta
                         )
                         
                     except Exception as se:
                         print(f"[CanvasWorker] Scanned PDF Fallback Failed: {se}")
                         # Mark as failed so user knows VLM ingestion failed
                         result = {"status": "failed", "error": str(se)}
                         print("[CanvasWorker] Marking result as FAILED due to VLM error.")
                else:
                     # PHASE 3: Hybrid Mode (High Text Density + Visuals)
                     print(f"[CanvasWorker] Text density normal. Checking for Visual Pages (Hybrid Mode)...")
                     from app.services.pdf_service import pdf_service
                     
                     # 1. Identify visual pages (Charts/Images)
                     visual_pages = pdf_service.identify_visual_pages(file_path)
                     
                     if visual_pages:
                         print(f"[CanvasWorker] Found {len(visual_pages)} visual pages: {visual_pages}. Triggering Hybrid VLM...")
                         from app.services.vision_service import vision_service
                         
                         try:
                             import asyncio
                             # 2. Convert ONLY visual pages to images
                             # Note: convert_pdf_to_images returns list corresponding to indices
                             images = pdf_service.convert_pdf_to_images(file_path, page_indices=visual_pages)
                             
                             vision_model = thing.content.get("vision_model", canvas_vision_model)
                             hybrid_descriptions = []
                             
                             for idx, (real_page_num, img_b64) in enumerate(zip(visual_pages, images)):
                                 display_page = real_page_num + 1
                                 print(f"[CanvasWorker] Analyzing Visual Page {display_page}...")
                                 
                                 # Send progress update (using 100% base since text is done, maybe just log?)
                                 # Or maybe 90-99 wait state?
                                 
                                 try:
                                      prompt = f"Analyze the visual elements (charts, diagrams, graphs, images) on this page (Page {display_page}). Describe the data, trends, or visual content in detail. Do NOT transcribe the main text blocks as they are already extracted."
                                      page_desc = await asyncio.wait_for(
                                          vision_service.analyze(
                                              image_data=img_b64,
                                              prompt=prompt,
                                              model_name=vision_model
                                          ),
                                          timeout=120.0
                                      )
                                 except Exception as ve:
                                      print(f"[CanvasWorker] Hybrid VLM Error on Page {display_page}: {ve}")
                                      page_desc = f"(Visual Analysis Failed: {ve})"
                                 
                                 hybrid_descriptions.append(f"--- Page {display_page} Visuals ---\n{page_desc}")
                             
                             combined_visuals = "\n\n".join(hybrid_descriptions)
                             print(f"[CanvasWorker] Hybrid Analysis Complete ({len(combined_visuals)} chars).")
                             
                             # 3. Store Visual Descriptions
                             # We append to existing text content or store separately?
                             # Let's append to 'generated_description' for visibility
                             new_content = dict(thing.content)
                             existing_gen = new_content.get("generated_description", "")
                             new_content["generated_description"] = (existing_gen + "\n\n" + combined_visuals).strip()
                             thing.content = new_content
                             
                             from sqlalchemy.orm.attributes import flag_modified
                             flag_modified(thing, "content")
                             db.commit()
                             
                             # 4. Ingest Visual Context
                             meta = base_metadata.copy()
                             meta.update({"type": "visual_context", "source": file_path})
                             rag_service.ingest_text(
                                 combined_visuals,
                                 metadata=meta
                             )
                             print("[CanvasWorker] Visual Context Ingested.")
                             
                         except Exception as he:
                             print(f"[CanvasWorker] Hybrid Mode Failed: {he}")
                             # Do not fail the whole job, as text is valid. Just log error.
                     else:
                         print("[CanvasWorker] No visual pages detected. Skipping VLM.")
        
        # Reload thing 
        thing = db.query(CanvasThing).filter(CanvasThing.id == thing_id).first()
        # Verify result status
        print(f"[CanvasWorker] Reloaded thing {thing_id}. Content keys: {thing.content.keys() if thing and thing.content else 'None'}")
        
        if result and result.get("status") == "success":
            thing.rag_status = RAGStatus.COMPLETED
            print(f"[CanvasWorker] Vectorization COMPLETED for thing {thing_id}")
            
            # 2-Phase Sync Cleanup
            if mode == "sync" and active_batch_id:
                print(f"[CanvasWorker] Sync Mode: Cleaning up legacy embeddings (Active Batch: {active_batch_id})...")
                deleted = rag_service.delete_legacy_embeddings(thing_id, active_batch_id)
                if deleted:
                    print(f"[CanvasWorker] Legacy cleanup successful.")
                    # Optionally update content to track current batch
                    new_content = dict(thing.content)
                    new_content["ingestion_batch_id"] = active_batch_id
                    thing.content = new_content
                    from sqlalchemy.orm.attributes import flag_modified
                    flag_modified(thing, "content")
                    db.commit()
        else:
            # Check if it was "no_documents_found" or error
            thing.rag_status = RAGStatus.FAILED
            error_msg = result.get("error") or f"Vectorization ended with status: {result.get('status')}"
            
            # Save error details
            new_content = dict(thing.content)
            new_content["last_error"] = error_msg
            thing.content = new_content
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(thing, "content")
            
            print(f"[CanvasWorker] Vectorization FAILED: {error_msg}")

        db.commit()
        
    except Exception as e:
        print(f"[CanvasWorker] Critical error in vectorization task: {e}")
        try:
           thing = db.query(CanvasThing).filter(CanvasThing.id == thing_id).first()
           if thing:
               thing.rag_status = RAGStatus.FAILED
               
               # Save error details for frontend display
               new_content = dict(thing.content or {})
               new_content["last_error"] = str(e)
               thing.content = new_content
               from sqlalchemy.orm.attributes import flag_modified
               flag_modified(thing, "content")
               
               db.commit()
        except:
             pass
    finally:
        db.close()
