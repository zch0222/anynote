from concurrent.futures import ProcessPoolExecutor

from constants.rag_constants import RAG_PDF_DIR
from core.config import RAG_LLM_MODEL, RAG_EMBEDDING_MODEL
from exceptions.business_exception import BusinessException
from model.dto import FileDownloadDTO
from utils.file_util import download_file
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
import chromadb
from langchain_chroma import Chroma
from typing_extensions import List, TypedDict
from langchain_core.documents import Document
from langchain_openai import ChatOpenAI
from langchain import hub
from langchain_openai import OpenAIEmbeddings
from langchain_ollama.chat_models import ChatOllama
import mmh3
from model.dto import RagQueryDTO
import asyncio
from core.logger import get_logger
import time
import json
from core.redis_server import RedisServer
from core.redis import get_redis_pool
from constants.redis_channel_constants import RAG_TASK_CHANNEL
from utils.model_util import get_model, get_embedding_model



# Define state for application
class State(TypedDict):
    question: str
    context: List[Document]
    answer: str

class RagService:

    def __init__(self):
        self.logger = get_logger()
        # self.redis_server = RedisServer(get_redis_pool())
        pass

    def get_vectorstore(self, file_download_dto: FileDownloadDTO):
        # chroma_client = chromadb.HttpClient(host='localhost', port=8000)
        chroma_client = chromadb.Client()

        embeddings = self.get_embeddings()
        collection_name = f"doc_{mmh3.hash(file_download_dto.hash_value, 0, False)}"
        vector_store_from_client = Chroma(
            client=chroma_client,
            # collection_name=collection_name,
            embedding_function=embeddings,
        )
        # l = chroma_client.list_collections()
        # if collection_name in [c.name for c in chroma_client.list_collections()]:
        #     return vector_store_from_client

        collection = chroma_client.get_or_create_collection(collection_name)
        docs = self.load_pdf(file_download_dto)
        text_splitter = self.get_text_splitter()
        vector_store_from_client.add_documents(documents=text_splitter.split_documents(docs), collection=collection)
        return vector_store_from_client

    def get_embeddings(self):
        return get_embedding_model(RAG_EMBEDDING_MODEL)
        # return OpenAIEmbeddings(model="text-embedding-3-small")

    def download_docs(self, doc_url: str, dest_folder: str) -> FileDownloadDTO:
        file_download_dto = download_file(doc_url, dest_folder)
        if file_download_dto is None:
            raise BusinessException(f"文档：\"{doc_url}\"下载失败")
        return file_download_dto

    def get_text_splitter(self):
        return RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)

    def load_pdf(self, file_download_dto: FileDownloadDTO):
        loader = PyPDFLoader(file_download_dto.file_path)
        pages = []
        for page in loader.load():
            pages.append(page)
        return pages


    def build_pdf_retriever(self, doc_url):
        file_download_dto = self.download_docs(doc_url, RAG_PDF_DIR)
        vector_store = self.get_vectorstore(file_download_dto)
        return vector_store

    # Define application steps
    def retrieve(self, doc_url: str, questions: str):
        vector_store = self.build_pdf_retriever(doc_url)
        retrieved_docs = vector_store.similarity_search(questions)
        return retrieved_docs

    def rag(self, doc_url: str, questions: str):
        rag_model = get_model(RAG_LLM_MODEL)
        # rag_model = ChatOpenAI(model="gpt-4o")
        prompt = hub.pull("rlm/rag-prompt")
        # prompt.invoke({
        #     "question": questions,
        #     "context": self.retrieve(doc_url, questions),
        # })
        chain = prompt | rag_model
        doc_context = self.retrieve(doc_url, questions)
        response = chain.invoke({
            "question": questions,
            "context": doc_context,
        })
        print(response.content)
        return str(response.content)

    async def send_heartbeat(self, task_id: str):
        while True:
            self.logger.info(f"taskid: {task_id}, heartbeat")
            RedisServer().publish(f"{RAG_TASK_CHANNEL}:{task_id}", {
                "id": task_id,
                "status": "running",
                "result": ""
            })
            await asyncio.sleep(5)

    def run_rag(self, doc_url: str, questions: str, task_id: str):

        redis_server = RedisServer()
        redis_server.publish(f"{RAG_TASK_CHANNEL}:{task_id}", {
            "id": task_id,
            "status": "running",
            "result": ""
        })
        try:
            res = self.rag(doc_url, questions)
            redis_server.publish(f"{RAG_TASK_CHANNEL}:{task_id}", {
                "id": task_id,
                "status": "finished",
                "result": res
            })
        except Exception as e:
            self.logger.exception(e)
            redis_server.publish(f"{RAG_TASK_CHANNEL}:{task_id}", {
                "id": task_id,
                "status": "failed",
                "result": str(e)
            })

    async def a_rag(self, rag_query_dto: RagQueryDTO, task_id: str):
        yield 'id: {}\nevent: message\ndata: {}\n\n'.format(int(time.time()), json.dumps({
            "id": task_id,
            "status": "running",
            "result": ""
        }))
        # # asyncio.get_running_loop().run_in_executor(executor, self.run_rag, rag_query_dto.doc_url, rag_query_dto.prompt, task_id)
        executor = ProcessPoolExecutor(max_workers=1)
        executor.submit(self.run_rag, rag_query_dto.doc_url, rag_query_dto.prompt, task_id)
        heartbeat_task = asyncio.create_task(self.send_heartbeat(task_id))


        # await heartbeat_task
        # # def callback(msg: str):
        # #     msg_data = json.loads(msg)
        try:
            async for msg in RedisServer().subscribe(f"{RAG_TASK_CHANNEL}:{task_id}"):
                self.logger.info(msg)
                msg_data = json.loads(msg)
                yield 'id: {}\nevent: message\ndata: {}\n\n'.format(int(time.time()), msg)
                if msg_data["status"] == "finished" or msg_data["status"] == "failed":
                    break
        except Exception as e:
            self.logger.exception(e)
        finally:
            executor.shutdown(wait=True)
            if not heartbeat_task.done():
                heartbeat_task.cancel()


