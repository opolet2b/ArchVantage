import os
import sys
import time
import asyncio

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.config_service import config_service
from app.services.rag_service import rag_service
from llama_index.core import SimpleDirectoryReader, Settings

def profile():
    pdf_file = r"c:\Users\opole\Downloads\ChatBotn\backend\data_storage\2026\05\29\73d92ca2-818a-4d04-8419-633be7c265bc_t2b_CV_Elaine.pdf"
    if not os.path.exists(pdf_file):
        print(f"Error: Test PDF file not found at {pdf_file}")
        return

    print("--- Starting Profiling ---")
    print(f"Target PDF: {pdf_file}")
    
    # 1. Profile Config & Initialization
    t0 = time.time()
    preset = config_service.get_default_embedding_preset()
    print(f"Default Embedding Preset: {preset.get('name') if preset else 'None'}")
    print(f"Preset Config: {preset}")
    
    rag_service.initialize()
    print(f"Initialization took: {time.time() - t0:.2f} seconds")
    
    # 2. Profile Loading / Text Extraction (SimpleDirectoryReader)
    t0 = time.time()
    reader = SimpleDirectoryReader(input_files=[pdf_file])
    documents_sdr = reader.load_data()
    t_load_sdr = time.time() - t0
    print(f"1a. SimpleDirectoryReader PDF Text Extraction took: {t_load_sdr:.2f} seconds (Total documents loaded: {len(documents_sdr)})")
    
    # 2b. Profile Loading / Text Extraction (pypdfium2)
    t0 = time.time()
    documents_pdfium = []
    try:
        import pypdfium2 as pdfium
        from llama_index.core import Document
        with pdfium.PdfDocument(pdf_file) as pdf:
            for i, page in enumerate(pdf):
                textpage = page.get_textpage()
                page_text = textpage.get_text_bounded()
                doc = Document(
                    text=page_text or "",
                    metadata={
                        "page_label": str(i + 1),
                        "file_name": os.path.basename(pdf_file)
                    }
                )
                documents_pdfium.append(doc)
        t_load_pdfium = time.time() - t0
        print(f"1b. pypdfium2 PDF Text Extraction took: {t_load_pdfium:.2f} seconds (Total documents loaded: {len(documents_pdfium)})")
    except Exception as e:
        print(f"pypdfium2 extraction failed: {e}")
        t_load_pdfium = 0
        
    documents = documents_pdfium if documents_pdfium else documents_sdr
    
    # 3. Profile Chunking / Node Parsing
    t0 = time.time()
    nodes = Settings.node_parser.get_nodes_from_documents(documents)
    t_chunk = time.time() - t0
    print(f"2. Chunking into nodes took: {t_chunk:.2f} seconds (Total nodes: {len(nodes)})")
    
    # 4. Profile Embedding Generation
    if nodes:
        t0 = time.time()
        print(f"Generating embeddings for {len(nodes)} nodes...")
        print(f"Current Settings.embed_model class: {Settings.embed_model.__class__.__name__}")
        print(f"Current Settings.embed_batch_size: {getattr(Settings, 'embed_batch_size', 'N/A')}")
        
        # We can call the embedding model directly on the nodes to see performance
        try:
            embeddings = Settings.embed_model.get_text_embedding_batch([node.get_content() for node in nodes])
            t_embed = time.time() - t0
            print(f"3. Generating Embeddings took: {t_embed:.2f} seconds")
        except Exception as e:
            print(f"Error during embedding generation: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    profile()
