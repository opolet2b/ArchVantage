from app.models.canvas_models import CanvasThing, Canvas, RAGStatus
from app.services.rag_service import rag_service
from app.services.llm_service import llm_service
from app.services.scraper_service import scraper_service

async def handle_async_vectorization(
    thing_id: str, 
    file_path: str, 
    canvas_id: str, 
    mode: str = "initial", 
    active_batch_id: str = None,
    scrape_options: dict = None
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
        canvas_vision_model = "default"
        owner_id = None
        try:
            canvas = db.query(Canvas).filter(Canvas.id == canvas_id).first()
            if canvas:
                owner_id = canvas.owner_id
                if canvas.owner_config:
                    settings = canvas.owner_config
                    print(f"[CanvasWorker] Resolving models from Canvas {canvas_id} settings: {settings}")
                    
                    # Resolve Primary LLM Model
                    canvas_model = (
                        settings.get("model") or 
                        settings.get("selectedModel") or 
                        "default"
                    )
                    
                    # Resolve Vision Model preference
                    # Frontend stores this in 'vision_model' or 'visionModel'
                    # DEBUG: Log settings to trace missing vision model
                    print(f"[CanvasWorker] Resolving models with owner_config keys: {list(settings.keys())}")
                    
                    canvas_vision_model = (
                        settings.get("vision_model") or
                        settings.get("visionModel") or
                        settings.get("selectedVisionModel") or
                        canvas_model # Fallback to primary model if no vision specific one
                    )
            
            print(f"[CanvasWorker] Resolved Canvas Models -> Primary: {canvas_model}, Vision: {canvas_vision_model}")
        except Exception as e:
            print(f"[CanvasWorker] Warning: Failed to resolve canvas model: {e}")
            import traceback
            traceback.print_exc()


        thing.rag_status = RAGStatus.PROCESSING
        db.commit()
        
        print(f"[CanvasWorker] Processing vectorization for thing {thing_id} (Mode: {mode})...")
        
        # Base metadata for all RAG items
        base_metadata = {
            "canvas_id": canvas_id, 
            "thing_id": thing_id,
            "title": thing.title or "Untitled Document",
            "file_name": thing.title or "Untitled Document"
        }
        if active_batch_id:
            base_metadata["ingestion_batch_id"] = active_batch_id
        
        result = None
        
        # Generic Progress Callback
        def update_progress(current, total):
            try:
                # Refresh to check if the user deleted the thing or clicked "Stop"
                try:
                    db.refresh(thing)
                except Exception as ex:
                    print(f"[CanvasWorker] Thing likely deleted: {ex}")
                    raise Exception("Abort: Thing was deleted.")
                
                if thing.rag_status == RAGStatus.FAILED:
                     raise Exception("Abort: RAG processing was stopped by user.")

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
                # Re-raise abortion signals so they bubble up to the ingestion loops and stop them
                if "Abort:" in str(e):
                    raise e

        if thing.type.value == "image":
             print(f"[CanvasWorker] Processing Image Thing using VLM...")
             from app.services.vision_service import vision_service
             import base64
             
             # 1. Read the image file
             try:
                 with open(file_path, "rb") as img_file:
                     image_data = base64.b64encode(img_file.read()).decode('utf-8')
                     
                 # 2. Get Vision Model preference
                 # Fix: If thing has "default" set, ignore it and fall back to canvas setting
                 item_model = thing.content.get("vision_model")
                 vision_model = item_model if item_model and item_model != "default" else canvas_vision_model
                 print(f"[CanvasWorker] Using Vision Model: {vision_model} (Item: {item_model}, Global: {canvas_vision_model})")
                 
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
                 
                 from starlette.concurrency import run_in_threadpool
                 result = await run_in_threadpool(
                     rag_service.ingest_text,
                     description,
                     metadata=meta
                 )

                 # Generate Zoom Summaries for Image
                 print(f"[CanvasWorker] Generating Zoom Summaries for Image Thing...")
                 summaries = await llm_service.generate_zoom_summaries(description, model_name=canvas_model)
                 thing.summaries = summaries
                 from sqlalchemy.orm.attributes import flag_modified
                 flag_modified(thing, "summaries")
                 db.commit()
                 
             except Exception as ve:
                 print(f"[CanvasWorker] VLM Analysis Failed: {ve}")
                 thing.rag_status = RAGStatus.FAILED
                 db.commit()
                 return




        elif thing.type.value == "text" or (thing.type.value == "document" and file_path == "TEXT_CONTENT_MODE"):
            print(f"[CanvasWorker] Processing Text Thing {thing_id}...")
            # Extract text content (support both 'text' and 'content' keys)
            text_content = thing.content.get("text") or thing.content.get("content")
            
            if text_content and isinstance(text_content, str) and len(text_content.strip()) > 0:
                print(f"[CanvasWorker] Ingesting {len(text_content)} chars of text.")
                
                # Ingest into RAG
                meta = base_metadata.copy()
                meta.update({"type": "text_node"})
                
                from starlette.concurrency import run_in_threadpool
                result = await run_in_threadpool(
                    rag_service.ingest_text,
                    text_content,
                    metadata=meta
                )

                # Generate Zoom Summaries for Text
                print(f"[CanvasWorker] Generating Zoom Summaries for Text Thing...")
                summaries = await llm_service.generate_zoom_summaries(text_content, model_name=canvas_model)
                thing.summaries = summaries
                from sqlalchemy.orm.attributes import flag_modified
                flag_modified(thing, "summaries")
                db.commit()
            else:
                print(f"[CanvasWorker] Text Thing {thing_id} has no valid content to ingest.")
                result = {"status": "no_content"}

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
                             
                             item_model = thing.content.get("vision_model")
                             vision_model = item_model if item_model and item_model != "default" else canvas_vision_model
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

                 # Generate Zoom Summaries for Image Slideshow
                 print(f"[CanvasWorker] Generating Zoom Summaries for Slideshow...")
                 summaries = await llm_service.generate_zoom_summaries(combined_text, model_name=canvas_model)
                 thing.summaries = summaries
                 from sqlalchemy.orm.attributes import flag_modified
                 flag_modified(thing, "summaries")
                 db.commit()
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

                # Generate Zoom Summaries for Slideshow (PPTX Mode)
                print(f"[CanvasWorker] Generating Zoom Summaries for PPTX Slideshow...")
                summaries = await llm_service.generate_zoom_summaries(f"PowerPoint Presentation: {thing.title}", model_name=canvas_model)
                thing.summaries = summaries
                from sqlalchemy.orm.attributes import flag_modified
                flag_modified(thing, "summaries")
                db.commit()

        elif thing.type.value == "table":
            print(f"[CanvasWorker] Processing Table Thing {thing_id}...")
            table_content = thing.content.get("csv") or thing.content.get("markdown") or str(thing.content.get("data", ""))
            
            if table_content:
                print(f"[CanvasWorker] Ingesting table data into RAG...")
                meta = base_metadata.copy()
                meta.update({"type": "table_node"})
                result = rag_service.ingest_text(table_content, metadata=meta)
                
                print(f"[CanvasWorker] Generating Zoom Summaries for Table...")
                summaries = await llm_service.generate_zoom_summaries(table_content, model_name=canvas_model)
                thing.summaries = summaries
                from sqlalchemy.orm.attributes import flag_modified
                flag_modified(thing, "summaries")
                db.commit()
            else:
                result = {"status": "no_content"}

        elif thing.type.value == "url":
            print(f"[CanvasWorker] Processing URL Thing {thing_id}...")
            url = thing.content.get("url")
            depth = scrape_options.get("depth", 0) if scrape_options else 0
            
            if url:
                # Progress and Cancel check helpers
                def update_scrape_progress(current_url, scraped_count, total_estimated):
                    try:
                        # Re-fetch from DB to ensure we don't overwrite other changes
                        # and to keep the session updated
                        db.refresh(thing)
                        new_content = dict(thing.content)
                        new_content["ingestion_progress"] = {
                            "current_url": current_url,
                            "scraped_count": scraped_count,
                            "status": "scraping"
                        }
                        thing.content = new_content
                        from sqlalchemy.orm.attributes import flag_modified
                        flag_modified(thing, "content")
                        db.commit()
                    except Exception as e:
                        print(f"[CanvasWorker] Scrape progress update failed: {e}")

                def check_scrape_cancelled():
                    try:
                        db.refresh(thing)
                        # If status was manually set back to NONE or FAILED, stop.
                        return thing.rag_status in ["none", "failed"]
                    except Exception as e:
                        print(f"[CanvasWorker] Scrape cancel check failed: {e}")
                        return False

                print(f"[CanvasWorker] Scraping URL: {url} with depth {depth}...")
                
                # Perform recursive scrape in threadpool to avoid blocking event loop
                from starlette.concurrency import run_in_threadpool
                scraped_pages = await run_in_threadpool(
                    scraper_service.scrape_recursive, 
                    url, 
                    max_depth=depth,
                    db=db,
                    user_id=owner_id,
                    progress_callback=update_scrape_progress,
                    check_cancel=check_scrape_cancelled
                )
                
                if scraped_pages:
                    # Update thing content with the map of pages and options
                    new_content = dict(thing.content)
                    new_content["pages"] = scraped_pages
                    new_content["scrape_options"] = scrape_options
                    
                    # Also update the primary 'text' field with root page content
                    # and a summary of what else was found
                    root_val = scraped_pages.get(url, "")
                    text_content = ""
                    
                    if root_val.startswith("__PDF_ASSET__:"):
                        text_content = f"# Scraped Root PDF\n\n[{url}]({url})\n\n"
                    else:
                        text_content = root_val + "\n\n---\n\n"
                    
                    # Add summary of other pages/PDFs
                    other_pages = [u for u in scraped_pages.keys() if u != url]
                    if other_pages:
                        text_content += "## Additional Content Found\n\n"
                        pdf_count = 0
                        page_count = 0
                        for other_url in other_pages:
                            val = scraped_pages[other_url]
                            if val.startswith("__PDF_ASSET__:"):
                                pdf_count += 1
                                asset_id = val.split(":")[1]
                                text_content += f"- [PDF] {other_url} (Asset: {asset_id})\n"
                            else:
                                page_count += 1
                                text_content += f"- [Page] {other_url}\n"
                        
                        print(f"[CanvasWorker] Scrape summary for {url}: {page_count} pages, {pdf_count} PDFs.")
                    
                    new_content["text_content"] = text_content
                    thing.content = new_content
                    from sqlalchemy.orm.attributes import flag_modified
                    flag_modified(thing, "content")
                    db.commit()

                    # Ingest each page into RAG in threadpool
                    print(f"[CanvasWorker] Ingesting {len(scraped_pages)} pages into RAG...")
                    def process_rag_ingestion_sync():
                        for page_url, content in scraped_pages.items():
                            meta = base_metadata.copy()
                            meta.update({
                                "type": "scraped_page",
                                "source_url": page_url,
                                "root_url": url
                            })
                            
                            if content.startswith("__PDF_ASSET__:"):
                                asset_id = content.split(":")[-1]
                                print(f"[CanvasWorker] Ingesting PDF Asset {asset_id} into RAG...")
                                # Find asset path
                                from app.models.asset_models import Asset
                                asset = db.query(Asset).filter(Asset.id == asset_id).first()
                                if asset:
                                    from app.services.asset_service import STORAGE_ROOT
                                    file_path = str(STORAGE_ROOT / asset.file_path)
                                    item_model = thing.content.get("vision_model")
                                    # Fallback to canvas vision model if not set on item
                                    v_model = item_model if item_model and item_model != "default" else canvas_vision_model
                                    
                                    rag_service.ingest_file(
                                        file_path=file_path,
                                        conversation_id=canvas_id,
                                        metadata=meta,
                                        model_name=canvas_model,
                                        vision_model_name=v_model,
                                        enable_vision=True # We want vision for scraped PDFs
                                    )
                            else:
                                rag_service.ingest_text(content, metadata=meta)
                    
                    await run_in_threadpool(process_rag_ingestion_sync)

                    # Generate zoom summaries for the root page
                    if root_val and not root_val.startswith("__PDF_ASSET__:"):
                        print(f"[CanvasWorker] Generating Zoom Summaries for URL Thing (Root Page)...")
                        summaries = await llm_service.generate_zoom_summaries(root_val, model_name=canvas_model)
                        thing.summaries = summaries
                        flag_modified(thing, "summaries")
                        db.commit()
                    
                    result = {"status": "success", "count": len(scraped_pages)}
                else:
                    result = {"status": "failed", "error": "No content could be scraped."}
            else:
                result = {"status": "failed", "error": "No URL found in thing content."}

        elif thing.type.value == "conversation":
            print(f"[CanvasWorker] Processing Conversation Thing {thing_id}...")
            messages = thing.content.get("messages", [])
            conv_text = "\n".join([f"{m.get('role')}: {m.get('content')}" for m in messages])
            
            if conv_text:
                print(f"[CanvasWorker] Ingesting conversation into RAG...")
                meta = base_metadata.copy()
                meta.update({"type": "conversation_node"})
                result = rag_service.ingest_text(conv_text, metadata=meta)
                
                print(f"[CanvasWorker] Generating Zoom Summaries for Conversation...")
                summaries = await llm_service.generate_zoom_summaries(conv_text, model_name=canvas_model)
                thing.summaries = summaries
                from sqlalchemy.orm.attributes import flag_modified
                flag_modified(thing, "summaries")
                db.commit()
            else:
                result = {"status": "no_content"}

        else:
            # Default Document Ingestion
            meta = base_metadata.copy()
            # CRITICAL FIX: Include asset_id so chat can filter by it if needed in future
            if thing.content.get("asset_id"):
                meta["asset_id"] = thing.content.get("asset_id")
            
            # Resolve vision model for this item (handling "default" override)
            item_model = thing.content.get("vision_model")
            vision_model = item_model if item_model and item_model != "default" else canvas_vision_model
            
            # DEBUG TRACE
            print(f"[CanvasWorker] DEBUG MODEL TRACE for Thing {thing_id}:")
            print(f"  - Content Keys: {list(thing.content.keys())}")
            print(f"  - Item Model (Raw): '{item_model}'")
            print(f"  - Global Canvas Vision Model: '{canvas_vision_model}'")
            print(f"  - Computed Vision Model: '{vision_model}'")
            print(f"  - Canvas LLM Model: '{canvas_model}'")

            # We explicitly disable vision in RAG Service because CanvasWorker handles hybrid analysis manually 
            # in Phase 3 (lines 800+). Enabling it here would cause double-processing.
            from starlette.concurrency import run_in_threadpool
            result = await run_in_threadpool(
                rag_service.ingest_file,
                file_path=file_path, 
                metadata=meta,
                progress_callback=update_progress,
                model_name=canvas_model,
                vision_model_name=vision_model,
                enable_vision=False 
            )
            
            if result.get("status") == "success":
                # Save extracted text to Thing for display (if available)
                if "full_text" in result:
                    print(f"[CanvasWorker] Saving extracted text to Thing {thing_id} ({len(result['full_text'])} chars)...")
                    new_content = dict(thing.content)
                    new_content["text_content"] = result["full_text"]
                    
                    # Save structured data if available (Excel/CSV)
                    if result.get("structured_data"):
                        print(f"[CanvasWorker] Saving structured data to Thing {thing_id}")
                        sd = result["structured_data"]
                        new_content["rows"] = sd.get("rows")
                        new_content["columns"] = sd.get("columns")
                    
                    thing.content = new_content
                    
                    from sqlalchemy.orm.attributes import flag_modified
                    flag_modified(thing, "content")
                    db.commit()
            elif result.get("status") == "no_content":
                print(f"[CanvasWorker] Warning: No content extracted for {thing_id}")
                new_content = dict(thing.content)
                new_content["text_content"] = "No text content could be extracted from this document."
                thing.content = new_content
                from sqlalchemy.orm.attributes import flag_modified
                flag_modified(thing, "content")
                db.commit()
            else:
                error_msg = result.get("error", "Unknown error during ingestion")
                print(f"[CanvasWorker] Ingestion Error for {thing_id}: {error_msg}")
                new_content = dict(thing.content)
                new_content["text_content"] = f"ERROR: {error_msg}"
                thing.content = new_content
                from sqlalchemy.orm.attributes import flag_modified
                flag_modified(thing, "content")
                db.commit()

            # Generate Zoom Summaries for Document (Standard Text Mode)
            print(f"[CanvasWorker] Generating Zoom Summaries for Document...")
            text_for_summary = result.get("full_text") or result.get("text") or thing.content.get("text_content")
            if text_for_summary:
                summaries = await llm_service.generate_zoom_summaries(text_for_summary, model_name=canvas_model)
                thing.summaries = summaries
                from sqlalchemy.orm.attributes import flag_modified
                flag_modified(thing, "summaries")
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
                         item_model = thing.content.get("vision_model")
                         vision_model = item_model if item_model and item_model != "default" else canvas_vision_model
                         
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
                         
                         # 3. Generate Zoom Summaries for Scanned PDF (Immediately)
                         print(f"[CanvasWorker] Generating Zoom Summaries for Scanned PDF...")
                         summaries = await llm_service.generate_zoom_summaries(combined_text, model_name=canvas_model)
                         thing.summaries = summaries
                         from sqlalchemy.orm.attributes import flag_modified
                         flag_modified(thing, "summaries")
                         db.commit()

                         # 4. Re-ingest as text (Appending to index)
                         try:
                             meta = base_metadata.copy()
                             meta.update({"type": "scanned_pdf_transcription", "source": file_path})
                             result = rag_service.ingest_text(
                                 combined_text,
                                 metadata=meta
                             )
                         except Exception as rag_err:
                             print(f"[CanvasWorker] RAG Ingestion Failed for Scanned PDF: {rag_err}")
                             # Do NOT fail the whole job, as we have text and summaries
                         
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
                             
                             item_model = thing.content.get("vision_model")
                             vision_model = item_model if item_model and item_model != "default" else canvas_vision_model
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

                             # 4. Generate/Update Zoom Summaries for Hybrid PDF (using full text + visual descriptions)
                             print(f"[CanvasWorker] Generating Zoom Summaries for Hybrid PDF...")
                             summary_input = (result.get("full_text", "") + "\n\n" + combined_visuals).strip()
                             summaries = await llm_service.generate_zoom_summaries(summary_input, model_name=canvas_model)
                             thing.summaries = summaries
                             from sqlalchemy.orm.attributes import flag_modified
                             flag_modified(thing, "summaries")
                             db.commit()
                             
                             # 5. Ingest Visual Context
                             try:
                                 meta = base_metadata.copy()
                                 meta.update({"type": "visual_context", "source": file_path})
                                 rag_service.ingest_text(
                                     combined_visuals,
                                     metadata=meta
                                 )
                                 print("[CanvasWorker] Visual Context Ingested.")
                             except Exception as rag_err:
                                 print(f"[CanvasWorker] RAG Ingestion Failed for Hybrid Visuals: {rag_err}")
                             
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
            
            # CRITICAL FIX: Ensure we commit the COMPLETED status for normal mode too!
            if mode != "sync":
                db.commit()

            # Trigger Document Processed Automation
            try:
                from app.services.automation_service import automation_service
                canvas = db.query(Canvas).filter(Canvas.id == canvas_id).first()
                user_id = canvas.owner_id if canvas else 1
                
                print(f"[CanvasWorker] Triggering onProcessed automation for thing {thing_id}")
                
                # Payload matching what automation_service expects for drop/entry
                payload = {
                    "thing_id": thing_id,
                    "domain_id": thing.domain_id,
                    "is_new_domain": True
                }
                
                await automation_service.handle_canvas_event(
                    db,
                    canvas_id,
                    "onProcessed",
                    payload,
                    user_id
                )
            except Exception as auto_err:
                print(f"[CanvasWorker] Failed to trigger automation: {auto_err}")
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
