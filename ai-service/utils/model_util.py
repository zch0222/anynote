from langchain_ollama.chat_models import ChatOllama
from langchain_openai import ChatOpenAI
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_openai import OpenAIEmbeddings
from core.config import DEEP_SEEK_URL, DEEP_SEEK_API_KEY


def get_ollama_model(model: str):
    return ChatOllama(model=model)

def get_openai_model(model: str):
    return ChatOpenAI(model=model)

def get_huggingface_embeddings(model: str):
    return HuggingFaceEmbeddings(model_name=model)

def get_openai_embeddings(model: str):
    return OpenAIEmbeddings(model=model)

def get_deepseek_model(model: str):
    return ChatOpenAI(model=model, base_url=DEEP_SEEK_URL,
                      api_key=DEEP_SEEK_API_KEY)

def get_model(model: str):
    split_model = model.split('_')
    print(split_model)
    if split_model[0] == "ollama":
        return get_ollama_model(split_model[1])
    elif split_model[0] == "openai":
        return get_openai_model(split_model[1])
    elif split_model[0] == "deepseek":
        return get_deepseek_model(split_model[1])

def get_embedding_model(model: str):
    split_model = model.split('_')
    print(split_model)
    if split_model[0] == "ollama":
        return get_ollama_model(split_model[1])
    elif split_model[0] == "openai":
        return get_openai_embeddings(split_model[1])
    elif split_model[0] == "huggingface":
        return get_huggingface_embeddings(split_model[1])