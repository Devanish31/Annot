# Use the NVIDIA CUDA base image with Conda
FROM nvidia/cuda:11.8.0-cudnn8-devel-ubuntu22.04

# Install system dependencies and Conda
RUN apt-get update && apt-get install -y wget bzip2 libgl1-mesa-glx libglib2.0-0 \
    build-essential python3-dev curl && \
    wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh -O miniconda.sh && \
    bash miniconda.sh -b -p /opt/conda && \
    rm miniconda.sh && \
    /opt/conda/bin/conda init bash && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install Node.js and npm
RUN curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - && \
    apt-get install -y nodejs

# Update PATH environment variable
ENV PATH /opt/conda/bin:$PATH

# Set the working directory in the container
WORKDIR /workspace

# Create the conda environment with Python 3.12
RUN conda create --name sam2 python=3.12 -y

# Install git inside the Conda environment
RUN conda install -n sam2 git -y

# Install required Python packages with GPU support and Flask
RUN conda run -n sam2 conda install -c pytorch pytorch torchvision torchaudio cudatoolkit=11.8 -y && \
    conda run -n sam2 conda install -c conda-forge opencv matplotlib pillow numpy jupyter flask flask-cors -y && \
    conda run -n sam2 pip install nodemon

# Install Vite globally
RUN npm install -g vite

# Install the SAM2 repository
RUN conda run -n sam2 pip install "git+https://github.com/facebookresearch/sam2.git"

# Copy your Flask app into the container
COPY ./annot_flask /workspace/flask_app

# Copy your React app into the container
COPY ./annotator_react /workspace/react_app

# Install dependencies for the Vite React app
WORKDIR /workspace/react_app
RUN npm install

# Build the Vite React app for production
RUN npm run build

# Go back to the workspace directory
WORKDIR /workspace

# Expose the port for Flask and Vite (React)
EXPOSE 5000 3000 8888

# Start both Flask and React servers using Vite for React, Flask for backend, and Jupyter
CMD ["conda", "run", "-n", "sam2", "/bin/bash", "-c", "nodemon --exec flask run --host=0.0.0.0 --port=5000 & cd /workspace/react_app && npm run dev -- --host 0.0.0.0 --port 3000 & jupyter notebook --ip=0.0.0.0 --allow-root --no-browser"]