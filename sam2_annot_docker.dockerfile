# Use the NVIDIA CUDA base image with Conda
FROM nvidia/cuda:11.8.0-cudnn8-devel-ubuntu22.04

# Install Conda
RUN apt-get update && apt-get install -y wget bzip2 && \
    wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh -O miniconda.sh && \
    bash miniconda.sh -b -p /opt/conda && \
    rm miniconda.sh && \
    /opt/conda/bin/conda init bash

# Update PATH environment variable
ENV PATH /opt/conda/bin:$PATH

# Set the working directory in the container
WORKDIR /workspace

# Install system dependencies required by OpenCV and others
RUN apt-get install -y libgl1-mesa-glx libglib2.0-0 && rm -rf /var/lib/apt/lists/*

# Install system dependencies required by Flask and React
RUN apt-get install -y build-essential python3-dev nodejs npm

# Create the conda environment with Python 3.12
RUN conda create --name sam2 python=3.12 -y

# Install git inside the Conda environment
RUN conda isntall -n sam2 git -y

# Activate the conda environment with Python 3.12
SHELL ["conda", "run", "n", "sam2", "/bin/bash", "-c"]

# Install required Python packages with GPU support and Flask
RUN conda install -n sam2 -c pytorch pytorch torchvision torchaudio cudatoolkit=11.8 -y
RUN conda install -n sam2 -c conda-forge opencv matplotlib pillow numpy jupyter flask flask-cors -y
RUN pip install nodemon

# Install Vite globally
RUN npm install -g vite

# Install the SAM2 repository
RUN pip install "git+https://github.com/facebookresearch/segment-anything-2.git"

# Copy your Flask app into the container (relative path since it's in the same folder as the Dockerfile)
COPY ./annot_flask /workspace/flask_app

# Copy your React app into the container (relative path since it's in the same folder as the Dockerfile)
COPY ./annotator_react /workspace/react_app.

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
CMD ["conda", "run", "-n", "sam2", "/bin/bash", "-c", "nodemon --exec flask run --host=0.0.0.0 --port=5000 & vite --host --port 3000 & jupyter notebook --ip=0.0.0.0 --allow-root --no-browser"]
