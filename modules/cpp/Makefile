CXX = g++
CXXFLAGS = -std=c++17 -Wall -Wextra -O3
LDLIBS = -lzip

SRC = zipCracker.cpp
OBJ = $(SRC:.cpp=.o)
TARGET = zipCracker

all: $(TARGET)

$(TARGET): $(OBJ)
	$(CXX) $(CXXFLAGS) -o $@ $^ $(LDLIBS)

%.o: %.cpp
	$(CXX) $(CXXFLAGS) -c $< -o $@

clean:
	rm -f $(OBJ) $(TARGET)

.PHONY: all clean 